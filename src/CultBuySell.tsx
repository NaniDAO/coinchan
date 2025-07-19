import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSendCalls,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PercentageSlider } from "@/components/ui/percentage-slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { handleWalletError } from "@/lib/errors";
import { formatEther, formatUnits, parseEther, parseUnits, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { useErc20Allowance } from "@/hooks/use-erc20-allowance";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CultHookAbi, CultHookAddress } from "@/constants/CultHook";
import {
  type TokenMeta,
  USDT_ADDRESS,
  CULT_ADDRESS,
  CULT_POOL_KEY,
  CULT_POOL_ID,
} from "@/lib/coins";
import { getCultHookTaxRate, toGross } from "@/lib/cult-hook-utils";
import {
  DEADLINE_SEC,
  SWAP_FEE,
  type ZAMMPoolKey,
  computePoolKey,
  createCoinSwapMulticall,
  estimateCoinToCoinOutput,
  withSlippage,
  getAmountIn,
  getAmountOut,
} from "@/lib/swap";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { nowSec, cn } from "./lib/utils";
import { useReserves } from "./hooks/use-reserves";
import { useBatchingSupported } from "./hooks/use-batching-supported";

export type Call = {
  to: Address;
  value?: bigint;
  data: Hex;
};

export interface SwapParams {
  address: `0x${string}`;
  sellToken: TokenMeta;
  buyToken: TokenMeta;
  sellAmt: string;
  buyAmt: string;
  reserves: { reserve0: bigint; reserve1: bigint };
  slippageBps: bigint;
  targetReserves?: { reserve0: bigint; reserve1: bigint };
  recipient?: `0x${string}`;
  exactOut?: boolean;
}

export async function buildSwapCalls(
  params: SwapParams & { publicClient: PublicClient }
): Promise<Call[]> {
  const {
    address,
    sellToken,
    buyToken,
    sellAmt,
    buyAmt,
    reserves,
    slippageBps,
    targetReserves,
    publicClient,
    recipient,
    exactOut,
  } = params;

  const calls: Call[] = [];

  // Determine swap context
  const swapRecipient = 
    recipient && /^0x[a-fA-F0-9]{40}$/.test(recipient)
      ? recipient
      : address;

  const isSellETH = sellToken.id === null;
  const isBuyETH = buyToken.id === null;
  const isCoinToCoin = !isSellETH && !isBuyETH;
  const isUSDT = (tok: TokenMeta) =>
    tok.isCustomPool && tok.symbol === "USDT";
  const isCULT = (tok: TokenMeta) =>
    tok.isCustomPool && tok.symbol === "CULT";
  const isCultHookSwap =
    (isSellETH && isCULT(buyToken)) ||
    (isCULT(sellToken) && isBuyETH);

  // 1. Fetch tax rate for CULT-hook swaps
  const cultTaxRate = isCultHookSwap
    ? await getCultHookTaxRate()
    : 0n;

  // 2. Bake in tax as extra slippage for minimum-out
  const effectiveSlippageBps = slippageBps + cultTaxRate;

  // 3. Parse amounts into token units
  const sellAmtInUnits = parseUnits(
    sellAmt || "0",
    sellToken.decimals || 18
  );
  const buyAmtInUnits = parseUnits(
    buyAmt || "0",
    buyToken.decimals || 18
  );

  // 4. Compute min-out for swapExactIn (includes tax as slippage on CULT)
  const minBuyAmount = withSlippage(
    buyAmtInUnits,
    effectiveSlippageBps
  );

  // 5. Deadline
  const deadline = nowSec() + BigInt(DEADLINE_SEC);

  // 6. Compute max-in for swapExactOut (unchanged for single-hop non-coin-to-coin)
  let maxSellAmount = sellAmtInUnits;
  if (exactOut && !isCoinToCoin) {
    if (!reserves) {
      throw new Error("Reserves required for exactOut calculations");
    }
    const [r0, r1] = isSellETH
      ? [reserves.reserve0, reserves.reserve1]
      : [reserves.reserve1, reserves.reserve0];

    const requiredInput = getAmountIn(
      buyAmtInUnits,
      r0,
      r1,
      sellToken.swapFee ?? SWAP_FEE
    );

    // apply only user slippage here — tax is delivered via toGross when sending ETH
    maxSellAmount =
      requiredInput +
      (requiredInput * slippageBps) / 10000n;
  }

  // 7. Allowance checks
  // 7a. USDT approval
  if (!isSellETH && isUSDT(sellToken)) {
    const allowance = (await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, ZAMMAddress],
    })) as bigint;

    const needed = exactOut ? maxSellAmount : sellAmtInUnits;
    if (allowance < needed) {
      calls.push({
        to: USDT_ADDRESS,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [ZAMMAddress, maxUint256],
        }) as Hex,
      });
    }
  }

  // 7b. CULT approval
  if (!isSellETH && isCULT(sellToken)) {
    const allowance = (await publicClient.readContract({
      address: CULT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, CultHookAddress],
    })) as bigint;

    const needed = exactOut ? maxSellAmount : sellAmtInUnits;
    if (allowance < needed) {
      calls.push({
        to: CULT_ADDRESS,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [CultHookAddress, maxUint256],
        }) as Hex,
      });
    }
  }

  // 7c. Other tokens: setOperator if needed
  if (
    !isSellETH &&
    !isUSDT(sellToken) &&
    !isCULT(sellToken)
  ) {
    const isOperator = (await publicClient.readContract({
      address: CoinsAddress,
      abi: CoinsAbi,
      functionName: "isOperator",
      args: [address, ZAMMAddress],
    })) as boolean;

    if (!isOperator) {
      calls.push({
        to: CoinsAddress,
        data: encodeFunctionData({
          abi: CoinsAbi,
          functionName: "setOperator",
          args: [ZAMMAddress, true],
        }) as Hex,
      });
    }
  }

  // 8. Build swap call(s)
  if (isCoinToCoin) {
    if (!targetReserves) {
      throw new Error("targetReserves are required for coin-to-coin swaps");
    }
    const sourceSwapFee = sellToken.isCustomPool
      ? sellToken.swapFee ?? SWAP_FEE
      : SWAP_FEE;
    const targetSwapFee = buyToken.isCustomPool
      ? buyToken.swapFee ?? SWAP_FEE
      : SWAP_FEE;

    const { withSlippage: minAmountOut, ethAmountOut } =
      estimateCoinToCoinOutput(
        sellToken.id!,
        buyToken.id!,
        sellAmtInUnits,
        reserves,
        targetReserves,
        slippageBps,
        sourceSwapFee,
        targetSwapFee
      );

    const sourcePoolKey = sellToken.isCustomPool
      ? (sellToken.poolKey as unknown as ZAMMPoolKey)
      : computePoolKey(
          sellToken.id!,
          sellToken.swapFee ?? SWAP_FEE
        );
    const targetPoolKey = buyToken.isCustomPool
      ? (buyToken.poolKey as unknown as ZAMMPoolKey)
      : computePoolKey(
          buyToken.id!,
          buyToken.swapFee ?? SWAP_FEE
        );

    const multicallData = createCoinSwapMulticall(
      sellToken.id!,
      buyToken.id!,
      sellAmtInUnits,
      ethAmountOut,
      minAmountOut,
      swapRecipient,
      sourcePoolKey,
      targetPoolKey
    );

    calls.push({
      to: ZAMMAddress,
      data: encodeFunctionData({
        abi: ZAMMAbi,
        functionName: "multicall",
        args: [multicallData],
      }) as Hex,
    });
  } else {
    // single-hop swap
    const poolKey =
      sellToken.isCustomPool || buyToken.isCustomPool
        ? (sellToken.isCustomPool
            ? sellToken.poolKey!
            : buyToken.poolKey!) as ZAMMPoolKey
        : (computePoolKey(
            isSellETH ? buyToken.id! : sellToken.id!,
            isSellETH
              ? buyToken.swapFee ?? SWAP_FEE
              : sellToken.swapFee ?? SWAP_FEE,
            isSellETH
              ? buyToken.source === "ZAMM"
                ? CoinsAddress
                : CookbookAddress
              : sellToken.source === "ZAMM"
              ? CoinsAddress
              : CookbookAddress
          ) as ZAMMPoolKey);

    const fromETH = isSellETH;
    const source = fromETH
      ? buyToken.source
      : sellToken.source;

    if (isCultHookSwap) {
      // CULT-hook swap
      if (exactOut) {
        const netMax = maxSellAmount;
        const msgValue = fromETH
          ? toGross(netMax, cultTaxRate)
          : 0n;
        const args = [
          CULT_POOL_KEY,
          buyAmtInUnits,
          netMax,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to: CultHookAddress,
          data: encodeFunctionData({
            abi: CultHookAbi,
            functionName: "swapExactOut",
            args,
          }) as Hex,
          ...(fromETH ? { value: msgValue } : {}),
        });
      } else {
        const netIn = sellAmtInUnits;
        const msgValue = fromETH
          ? toGross(netIn, cultTaxRate)
          : 0n;
        const args = [
          CULT_POOL_KEY,
          netIn,
          minBuyAmount,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to: CultHookAddress,
          data: encodeFunctionData({
            abi: CultHookAbi,
            functionName: "swapExactIn",
            args,
          }) as Hex,
          ...(fromETH ? { value: msgValue } : {}),
        });
      }
    } else {
      // regular swap
      if (exactOut) {
        const args = [
          poolKey,
          buyAmtInUnits,
          maxSellAmount,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to:
            source === "ZAMM"
              ? ZAMMAddress
              : CookbookAddress,
          data: encodeFunctionData({
            abi:
              source === "ZAMM"
                ? ZAMMAbi
                : CookbookAbi,
            functionName: "swapExactOut",
            args,
          }) as Hex,
          ...(fromETH ? { value: maxSellAmount } : {}),
        });
      } else {
        const args = [
          poolKey,
          sellAmtInUnits,
          minBuyAmount,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to:
            source === "ZAMM"
              ? ZAMMAddress
              : CookbookAddress,
          data: encodeFunctionData({
            abi:
              source === "ZAMM"
                ? ZAMMAbi
                : CookbookAbi,
            functionName: "swapExactIn",
            args,
          }) as Hex,
          ...(fromETH ? { value: sellAmtInUnits } : {}),
        });
      }
    }
  }

  return calls;
}

// Flashing price animation keyframes
const priceUpdateAnimation = `
  .cult-container {
    position: relative;
  }
  .cult-container::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at center, rgba(255,0,0,0.05) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  .cult-container > * {
    position: relative;
    z-index: 1;
  }
  @keyframes shake {
    0% { transform: translate(0, 0) rotate(0deg); }
    20% { transform: translate(-2px, 0) rotate(-1deg); }
    40% { transform: translate(2px, 0) rotate(1deg); }
    60% { transform: translate(-2px, 0) rotate(-1deg); }
    80% { transform: translate(2px, 0) rotate(1deg); }
    100% { transform: translate(0, 0) rotate(0deg); }
  }
  @keyframes glow {
    0% { text-shadow: 0 0 5px #ff0000; }
    50% { text-shadow: 0 0 20px #ff0000, 0 0 30px #ff0000; }
    100% { text-shadow: 0 0 5px #ff0000; }
  }
  .price-update {
    animation: shake 0.5s ease-in-out, glow 0.5s ease-in-out;
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .progress-shimmer {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer 2s infinite;
  }
`;

export const CultBuySell = () => {
  const [tab, setTab] = useState<"buy" | "sell" | "add-liquidity" | "remove-liquidity">("buy");
  const [amount, setAmount] = useState("");
  const [liquidityEthAmount, setLiquidityEthAmount] = useState("");
  const [liquidityCultAmount, setLiquidityCultAmount] = useState("");
  const [lpBurnAmount, setLpBurnAmount] = useState("");
  const [expectedEth, setExpectedEth] = useState("0");
  const [expectedCult, setExpectedCult] = useState("0");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [buyPercentage, setBuyPercentage] = useState(0);
  const [cultPrice, setCultPrice] = useState<string>("--.--.--");
  const [cultTaxRate, setCultTaxRate] = useState<bigint>(0n);
  const [priceAnimating, setPriceAnimating] = useState(false);
  const [totalSupply, setTotalSupply] = useState<bigint>(0n);
  const [marketCap, setMarketCap] = useState<string>("--");
  const [accumulatedTax, setAccumulatedTax] = useState<string>("0");
  const [floorProgress, setFloorProgress] = useState<number>(0);

  const { address, isConnected } = useAccount();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { sendCalls } = useSendCalls();
  const isBatchingSupported = useBatchingSupported();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Fetch ETH balance
  const { data: ethBalance } = useBalance({
    address: address,
    chainId: mainnet.id,
  });

  // Fetch CULT balance
  const { data: cultBalance } = useReadContract({
    address: CULT_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: mainnet.id,
  });

  // CULT allowance for Cookbook (liquidity)
  const {
    allowance: cultAllowance,
    refetchAllowance: refetchCultAllowance,
    approveMax: approveCultMax,
  } = useErc20Allowance({
    token: CULT_ADDRESS,
    spender: CookbookAddress, // Cookbook for liquidity
  });


  // Fetch reserves for CULT pool from Cookbook
  const { data: reserves } = useReserves({
    poolId: CULT_POOL_ID,
    source: "COOKBOOK", // CULT uses Cookbook for liquidity
  });

  // Fetch LP balance for CULT pool
  const { data: lpBalance } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "balanceOf",
    args: address ? [address, CULT_POOL_ID] : undefined,
    chainId: mainnet.id,
  });

  // Fetch pool info for total supply
  const { data: poolInfo } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "pools",
    args: [CULT_POOL_ID],
    chainId: mainnet.id,
  });

  // Create token metadata objects
  const ethToken: TokenMeta = {
    id: null,
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
    source: "ZAMM",
    isCustomPool: false,
  };

  const cultToken: TokenMeta = {
    id: 999999n,
    name: "Milady Cult Coin",
    symbol: "CULT",
    decimals: 18,
    source: "COOKBOOK", // CULT uses Cookbook
    isCustomPool: true,
    poolKey: CULT_POOL_KEY as any, // Type cast to avoid TS error
    swapFee: 30n, // 0.3% fee
  };

  // Fetch tax rate on mount and periodically
  useEffect(() => {
    const fetchTaxRate = async () => {
      try {
        const rate = await getCultHookTaxRate();
        setCultTaxRate(rate);
      } catch (error) {
        console.error("Failed to fetch CULT tax rate:", error);
      }
    };

    fetchTaxRate();
    const interval = setInterval(fetchTaxRate, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch CULT total supply
  useEffect(() => {
    const fetchSupply = async () => {
      if (!publicClient) return;
      try {
        const supply = await publicClient.readContract({
          address: CULT_ADDRESS,
          abi: erc20Abi,
          functionName: "totalSupply",
        }) as bigint;
        setTotalSupply(supply);
      } catch (error) {
        console.error("Failed to fetch CULT supply:", error);
      }
    };

    fetchSupply();
  }, [publicClient]);

  // Fetch accumulated tax from the treasury address
  useEffect(() => {
    const fetchAccumulatedTax = async () => {
      if (!publicClient) return;
      try {
        const balance = await publicClient.getBalance({
          address: "0xf164Af3126e544E6d5aAEcf5Ae10cd0fBD215E02",
        });
        const ethAmount = formatEther(balance);
        setAccumulatedTax(ethAmount);
        
        // Calculate progress towards 2.488 ETH floor
        const progress = (parseFloat(ethAmount) / 2.488) * 100;
        setFloorProgress(Math.min(progress, 100));
      } catch (error) {
        console.error("Failed to fetch accumulated tax:", error);
      }
    };

    fetchAccumulatedTax();
    const interval = setInterval(fetchAccumulatedTax, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, [publicClient]);

  // Update CULT price from reserves
  useEffect(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return;

    try {
      // Calculate price: 1 ETH = ? CULT
      const oneEth = parseEther("1");
      const cultOut = getAmountOut(oneEth, reserves.reserve0, reserves.reserve1, 30n);
      const price = formatUnits(cultOut, 18);
      
      // Animate price update
      if (cultPrice !== "--.--.--" && cultPrice !== price) {
        setPriceAnimating(true);
        setTimeout(() => setPriceAnimating(false), 1000);
      }
      
      setCultPrice(parseFloat(price).toFixed(2));

      // Calculate market cap if we have total supply
      if (totalSupply > 0n) {
        // Price in ETH per CULT
        const pricePerCultInEth = 1 / parseFloat(price);
        // Assume ETH price (you could fetch this from an oracle)
        const ethPriceUsd = 2500; // Placeholder - in production, fetch from price feed
        const marketCapUsd = pricePerCultInEth * ethPriceUsd * Number(formatUnits(totalSupply, 18));
        
        if (marketCapUsd >= 1e9) {
          setMarketCap(`$${(marketCapUsd / 1e9).toFixed(2)}B`);
        } else if (marketCapUsd >= 1e6) {
          setMarketCap(`$${(marketCapUsd / 1e6).toFixed(2)}M`);
        } else if (marketCapUsd >= 1e3) {
          setMarketCap(`$${(marketCapUsd / 1e3).toFixed(2)}K`);
        } else {
          setMarketCap(`$${marketCapUsd.toFixed(2)}`);
        }
      }
    } catch (error) {
      console.error("Failed to calculate CULT price:", error);
    }
  }, [reserves, cultPrice, totalSupply]);

  const estimated = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return "0";
    try {
      if (tab === "buy") {
        // Input: ETH amount -> Output: CULT amount
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, 30n);
        // Apply tax for display (actual min amount is handled in buildSwapCalls)
        return formatUnits(rawOut, 18);
      } else {
        // Input: CULT amount -> Output: ETH amount
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, 30n);
        return formatEther(rawOut);
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab]);

  // Calculate optimal liquidity amounts based on pool ratio
  const syncLiquidityAmounts = useCallback((isEthInput: boolean, value: string) => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return;
    
    try {
      if (isEthInput) {
        setLiquidityEthAmount(value);
        if (!value || parseFloat(value) === 0) {
          setLiquidityCultAmount("");
          return;
        }
        
        // Calculate optimal CULT amount based on pool ratio
        const ethAmount = parseEther(value);
        const optimalCultAmount = (ethAmount * reserves.reserve1) / reserves.reserve0;
        setLiquidityCultAmount(formatUnits(optimalCultAmount, 18));
      } else {
        setLiquidityCultAmount(value);
        if (!value || parseFloat(value) === 0) {
          setLiquidityEthAmount("");
          return;
        }
        
        // Calculate optimal ETH amount based on pool ratio
        const cultAmount = parseUnits(value, 18);
        const optimalEthAmount = (cultAmount * reserves.reserve0) / reserves.reserve1;
        setLiquidityEthAmount(formatEther(optimalEthAmount));
      }
    } catch (error) {
      console.error("Error calculating optimal amounts:", error);
    }
  }, [reserves]);

  // Calculate expected amounts when removing liquidity
  useEffect(() => {
    if (!lpBurnAmount || !reserves || !poolInfo) {
      setExpectedEth("0");
      setExpectedCult("0");
      return;
    }

    try {
      const burnAmount = parseUnits(lpBurnAmount, 18);
      const totalSupply = poolInfo[6] as bigint; // Total LP supply at index 6
      
      if (totalSupply === 0n) {
        setExpectedEth("0");
        setExpectedCult("0");
        return;
      }

      // Calculate proportional amounts
      const ethAmount = (burnAmount * reserves.reserve0) / totalSupply;
      const cultAmount = (burnAmount * reserves.reserve1) / totalSupply;

      setExpectedEth(formatEther(ethAmount));
      setExpectedCult(formatUnits(cultAmount, 18));
    } catch (error) {
      console.error("Error calculating LP burn amounts:", error);
      setExpectedEth("0");
      setExpectedCult("0");
    }
  }, [lpBurnAmount, reserves, poolInfo]);

  const handleBuyPercentageChange = useCallback(
    (percentage: number) => {
      setBuyPercentage(percentage);

      if (!ethBalance?.value) return;

      const adjustedBalance =
        percentage === 100 ? (ethBalance.value * 99n) / 100n : (ethBalance.value * BigInt(percentage)) / 100n;

      const newAmount = formatEther(adjustedBalance);
      setAmount(newAmount);
    },
    [ethBalance?.value],
  );

  // Reset amounts when switching tabs
  useEffect(() => {
    setAmount("");
    setLiquidityEthAmount("");
    setLiquidityCultAmount("");
    setLpBurnAmount("");
    setExpectedEth("0");
    setExpectedCult("0");
    setTxHash(undefined);
    setErrorMessage(null);
  }, [tab]);

  useEffect(() => {
    if (tab !== "buy" || !ethBalance?.value || !amount) {
      setBuyPercentage(0);
      return;
    }

    try {
      const amountWei = parseEther(amount);
      if (ethBalance.value > 0n) {
        const calculatedPercentage = Number((amountWei * 100n) / ethBalance.value);
        setBuyPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
      }
    } catch {
      setBuyPercentage(0);
    }
  }, [amount, ethBalance?.value, tab]);

  const executeAddLiquidity = async () => {
    if (!reserves || !address || !publicClient) return;

    setErrorMessage(null);

    try {
      if (chainId !== mainnet.id) {
        switchChain({ chainId: mainnet.id });
        return;
      }

      const ethAmount = parseEther(liquidityEthAmount || "0");
      const cultAmount = parseUnits(liquidityCultAmount || "0", 18);

      // Check CULT allowance for Cookbook
      if (cultAllowance === undefined || cultAmount > cultAllowance) {
        try {
          setErrorMessage("Approving CULT for liquidity...");
          const approved = await approveCultMax();
          if (!approved) {
            setErrorMessage("CULT approval cancelled");
            return;
          }

          const receipt = await publicClient.waitForTransactionReceipt({ hash: approved });
          if (receipt.status !== "success") {
            setErrorMessage("CULT approval failed");
            return;
          }
          
          await refetchCultAllowance();
          setErrorMessage(null);
        } catch (err) {
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            setErrorMessage(`Approval failed: ${errorMsg}`);
          }
          return;
        }
      }

      // Calculate minimum amounts with slippage
      const minEthAmount = withSlippage(ethAmount, 100n); // 1% slippage
      const minCultAmount = withSlippage(cultAmount, 100n);

      // Execute addLiquidity on Cookbook
      const hash = await sendTransactionAsync({
        to: CookbookAddress,
        data: encodeFunctionData({
          abi: CookbookAbi,
          functionName: "addLiquidity",
          args: [
            CULT_POOL_KEY as any,
            ethAmount,
            cultAmount,
            minEthAmount,
            minCultAmount,
            address,
            nowSec() + BigInt(DEADLINE_SEC),
          ],
        }),
        value: ethAmount,
        chainId: mainnet.id,
      });
      
      setTxHash(hash);
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  const executeRemoveLiquidity = async () => {
    if (!reserves || !address || !publicClient) return;

    setErrorMessage(null);

    try {
      if (chainId !== mainnet.id) {
        switchChain({ chainId: mainnet.id });
        return;
      }

      const burnAmount = parseUnits(lpBurnAmount || "0", 18);
      const ethAmount = parseEther(expectedEth || "0");
      const cultAmount = parseUnits(expectedCult || "0", 18);

      // Calculate minimum amounts with slippage
      const minEthAmount = withSlippage(ethAmount, 100n); // 1% slippage
      const minCultAmount = withSlippage(cultAmount, 100n);

      // Execute removeLiquidity on Cookbook
      const hash = await sendTransactionAsync({
        to: CookbookAddress,
        data: encodeFunctionData({
          abi: CookbookAbi,
          functionName: "removeLiquidity",
          args: [
            CULT_POOL_KEY as any,
            burnAmount,
            minEthAmount,
            minCultAmount,
            address,
            nowSec() + BigInt(DEADLINE_SEC),
          ],
        }),
        chainId: mainnet.id,
      });
      
      setTxHash(hash);
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  const executeSwap = async () => {
    if (!reserves || !address || !publicClient) return;

    setErrorMessage(null);

    try {
      if (chainId !== mainnet.id) {
        switchChain({ chainId: mainnet.id });
        return;
      }

      const sellToken = tab === "buy" ? ethToken : cultToken;
      const buyToken = tab === "buy" ? cultToken : ethToken;

      const calls = await buildSwapCalls({
        address,
        sellToken,
        buyToken,
        sellAmt: amount,
        buyAmt: estimated,
        reserves,
        slippageBps: 100n, // 1% slippage
        publicClient,
      });

      if (calls.length === 0) {
        throw new Error("No swap calls generated");
      }

      // Execute calls
      if (calls.length === 1) {
        const call = calls[0];
        const hash = await sendTransactionAsync({
          to: call.to,
          value: call.value,
          data: call.data,
          chainId: mainnet.id,
        });
        setTxHash(hash);
      } else if (isBatchingSupported) {
        // Use sendCalls for multiple calls
        sendCalls({ calls, chainId: mainnet.id });
        // sendCalls doesn't return a hash, so we use a placeholder
        // For sendCalls, we don't get a tx hash immediately
        setTxHash("0x1" as `0x${string}`); // Placeholder to show success
      } else {
        // Execute sequentially
        for (const call of calls) {
          const hash = await sendTransactionAsync({
            to: call.to,
            value: call.value,
            data: call.data,
            chainId: mainnet.id,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }
        setTxHash(calls[calls.length - 1].to as `0x${string}`); // Set last tx hash
      }
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: priceUpdateAnimation }} />
      <div className="max-w-2xl mx-auto p-4 cult-container">
        <div className="text-center mb-6">
          <img
            src="/cult.jpg"
            alt="CULT Logo"
            className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-red-500 shadow-lg shadow-red-500/30 hover:scale-105 transition-transform"
          />
          <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-red-500 to-red-600 bg-clip-text">Milady Cult Coin</h1>
          <div className={cn("text-lg font-mono mt-2", priceAnimating && "price-update")}>
            <span className="text-red-400">1 ETH = {cultPrice} CULT</span>
          </div>
          
          {/* Pool Info Display */}
          <div className="mt-4 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Pool Reserves:</span>
              <span className="text-white font-mono text-xs">
                {reserves ? (
                  <>
                    {parseFloat(formatEther(reserves.reserve0)).toFixed(4)} ETH / {parseFloat(formatUnits(reserves.reserve1, 18)).toLocaleString()} CULT
                  </>
                ) : "Loading..."}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Supply:</span>
              <span className="text-white font-mono">
                {totalSupply > 0n ? parseFloat(formatUnits(totalSupply, 18)).toLocaleString() : "--"} CULT
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Market Cap:</span>
              <span className="text-white font-mono">{marketCap}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Swap Fee:</span>
              <span className="text-white font-mono">0.3%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Milady/ACC Tax:</span>
              <span className="text-red-400 font-mono">0.1%</span>
            </div>
            {cultTaxRate > 0n && (
              <div className="flex justify-between">
                <span className="text-gray-400">Additional Tax:</span>
                <span className="text-red-400 font-mono">{(Number(cultTaxRate) / 100).toFixed(2)}%</span>
              </div>
            )}
            {lpBalance !== undefined && lpBalance > 0n && (
              <div className="flex justify-between">
                <span className="text-gray-400">Your LP Tokens:</span>
                <span className="text-white font-mono">{formatUnits(lpBalance, 18)} LP</span>
              </div>
            )}
          </div>

          {/* Milady Floor Charging Bar */}
          <div className="mt-4 p-4 bg-gradient-to-b from-gray-900/70 to-black/50 border border-red-900/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-red-400">Milady Floor Charge</span>
              <span className="text-xs text-gray-400">
                {floorProgress > 0 && floorProgress < 100 ? "✨ " : ""}{floorProgress.toFixed(4)}%
              </span>
            </div>
            
            <div className="relative h-16 bg-black/50 rounded-lg overflow-hidden border border-red-900/20">
              {/* Background floor image */}
              <img 
                src="/floor.png" 
                alt="Milady Floor" 
                className="absolute inset-0 w-full h-full object-cover opacity-20"
              />
              
              {/* Progress bar */}
              <div 
                className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-600/80 to-red-500/60 transition-all duration-1000 ease-out"
                style={{ width: `${floorProgress}%` }}
              >
                <div className="absolute inset-0 bg-red-400/20 animate-pulse" />
                <div className="absolute inset-0 progress-shimmer" />
              </div>
              
              {/* ETH amount text overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-white font-mono text-sm font-bold drop-shadow-lg">
                    {parseFloat(accumulatedTax).toFixed(6)} ETH
                  </div>
                  <div className="text-xs text-gray-300 drop-shadow">
                    of 2.488 ETH floor
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <a 
                href="https://etherscan.io/address/0xf164Af3126e544E6d5aAEcf5Ae10cd0fBD215E02"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-red-400 transition-colors"
              >
                Treasury: 0xf164...5E02
              </a>
              <span className="text-red-400">0.1% tax accumulating</span>
            </div>
            
            {/* Subtle note about hooks */}
            <div className="mt-3 text-xs text-gray-600 leading-relaxed">
              <span className="opacity-70">
                CultHook is a demo of ZAMM hooks, which are extensions to pools that enable custom tooling, 
                such as modular buybacks. In this case, Cult, the Milady Coin, is taxed per trade in ETH 
                into a pot to buy floor miladys. This pot will get more automated over time.
              </span>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell" | "add-liquidity" | "remove-liquidity")} className="relative z-10">
          <TabsList className="bg-black/50 border border-red-900/30">
            <TabsTrigger value="buy" className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400">
              Buy CULT
            </TabsTrigger>
            <TabsTrigger value="sell" className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400">
              Sell CULT
            </TabsTrigger>
            <TabsTrigger value="add-liquidity" className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400">
              Add Liquidity
            </TabsTrigger>
            <TabsTrigger value="remove-liquidity" className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400">
              Remove Liquidity
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="max-w-2xl">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-400">Using ETH</span>
              <Input
                type="number"
                placeholder="Amount ETH"
                value={amount}
                min="0"
                step="any"
                onChange={(e) => setAmount(e.currentTarget.value)}
                disabled={false}
              />

              {ethBalance?.value && ethBalance.value > 0n && isConnected ? (
                <div className="mt-2 pt-2 border-t border-primary/20">
                  <PercentageSlider value={buyPercentage} onChange={handleBuyPercentageChange} />
                </div>
              ) : null}

              <span className="text-sm font-medium text-red-600">
                You will receive ~ {estimated} CULT
              </span>
              <Button
                onClick={executeSwap}
                disabled={!isConnected || isPending || !amount}
                variant="default"
                className={`bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold transition-all duration-300 shadow-lg shadow-red-500/30`}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingLogo size="sm" className="scale-75" />
                    Buying…
                  </span>
                ) : (
                  "Buy CULT"
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="sell" className="max-w-2xl">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-red-600">Using CULT</span>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="Amount CULT"
                  value={amount}
                  min="0"
                  step="any"
                  onChange={(e) => setAmount(e.currentTarget.value)}
                  disabled={false}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">You will receive ~ {estimated} ETH</span>
                {cultBalance !== undefined ? (
                  <button
                    className="self-end text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                    onClick={() => setAmount(formatUnits(cultBalance, 18))}
                    disabled={false}
                  >
                    MAX ({formatUnits(cultBalance, 18)} CULT)
                  </button>
                ) : (
                  <button className="self-end text-sm font-medium text-gray-500" disabled={true}>
                    MAX
                  </button>
                )}
              </div>
              <Button
                onClick={executeSwap}
                disabled={!isConnected || isPending || !amount}
                variant="outline"
                className={`border border-red-600/50 text-red-400 hover:bg-red-600/10 hover:border-red-500 transition-all duration-300`}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingLogo size="sm" className="scale-75" />
                    Selling…
                  </span>
                ) : (
                  "Sell CULT"
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="add-liquidity" className="max-w-2xl">
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-400">ETH Amount</span>
                <Input
                  type="number"
                  placeholder="Amount ETH"
                  value={liquidityEthAmount}
                  min="0"
                  step="any"
                  onChange={(e) => syncLiquidityAmounts(true, e.currentTarget.value)}
                  disabled={false}
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-red-600">CULT Amount</span>
                <Input
                  type="number"
                  placeholder="Amount CULT"
                  value={liquidityCultAmount}
                  min="0"
                  step="any"
                  onChange={(e) => syncLiquidityAmounts(false, e.currentTarget.value)}
                  disabled={false}
                />
                {cultBalance !== undefined && (
                  <button
                    className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                    onClick={() => syncLiquidityAmounts(false, formatUnits(cultBalance, 18))}
                    disabled={false}
                  >
                    MAX: {formatUnits(cultBalance, 18)} CULT
                  </button>
                )}
              </div>

              {/* Show pool share preview */}
              {liquidityEthAmount && liquidityCultAmount && reserves && (
                <div className="mt-2 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pool Share:</span>
                    <span className="text-white font-mono">
                      {(() => {
                        const ethLiq = parseEther(liquidityEthAmount || "0");
                        const totalLiq = reserves.reserve0 + ethLiq;
                        const share = totalLiq > 0n ? (ethLiq * 10000n) / totalLiq : 0n;
                        return `${(Number(share) / 100).toFixed(2)}%`;
                      })()}
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={executeAddLiquidity}
                disabled={!isConnected || isPending || !liquidityEthAmount || !liquidityCultAmount}
                variant="default"
                className={`bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold transition-all duration-300 shadow-lg shadow-red-500/30`}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingLogo size="sm" className="scale-75" />
                    Adding Liquidity…
                  </span>
                ) : cultAllowance !== undefined && parseUnits(liquidityCultAmount || "0", 18) > cultAllowance ? (
                  "Approve CULT & Add Liquidity"
                ) : (
                  "Add Liquidity"
                )}
              </Button>

              <div className="text-xs text-gray-500 text-center mt-2">
                Note: CULT liquidity is added through the Cookbook contract
              </div>
            </div>
          </TabsContent>

          <TabsContent value="remove-liquidity" className="max-w-2xl">
            <div className="flex flex-col gap-4">
              {/* LP Balance Display */}
              <div className="p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Your LP Balance:</span>
                  <span className="text-white font-mono">
                    {lpBalance ? formatUnits(lpBalance, 18) : "0"} LP
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-400">LP Tokens to Remove</span>
                <Input
                  type="number"
                  placeholder="Amount of LP tokens"
                  value={lpBurnAmount}
                  min="0"
                  step="any"
                  onChange={(e) => setLpBurnAmount(e.currentTarget.value)}
                  disabled={false}
                />
                {lpBalance !== undefined && lpBalance > 0n && (
                  <button
                    className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                    onClick={() => setLpBurnAmount(formatUnits(lpBalance, 18))}
                    disabled={false}
                  >
                    MAX: {formatUnits(lpBalance, 18)} LP
                  </button>
                )}
              </div>

              {/* Expected output preview */}
              {lpBurnAmount && parseFloat(lpBurnAmount) > 0 && (
                <div className="mt-2 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-2">
                  <div className="text-gray-400 mb-1">You will receive:</div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ETH:</span>
                    <span className="text-white font-mono">
                      {parseFloat(expectedEth).toFixed(6)} ETH
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">CULT:</span>
                    <span className="text-white font-mono">
                      {parseFloat(expectedCult).toLocaleString()} CULT
                    </span>
                  </div>
                </div>
              )}

              <Button
                onClick={executeRemoveLiquidity}
                disabled={!isConnected || isPending || !lpBurnAmount || parseFloat(lpBurnAmount) <= 0}
                variant="default"
                className={`bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold transition-all duration-300 shadow-lg shadow-red-500/30`}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <LoadingLogo size="sm" className="scale-75" />
                    Removing Liquidity…
                  </span>
                ) : (
                  "Remove Liquidity"
                )}
              </Button>

              <div className="text-xs text-gray-500 text-center mt-2">
                Note: Liquidity removal burns LP tokens and returns ETH + CULT
              </div>
            </div>
          </TabsContent>

          {errorMessage && <p className="text-destructive text-sm mt-2">{errorMessage}</p>}
          {isSuccess && <p className="text-green-600 text-sm mt-2">Transaction confirmed!</p>}
        </Tabs>

        {/* Contract Links */}
        <div className="mt-8 text-center space-y-2">
          <a
            href={`https://etherscan.io/address/${CULT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-gray-500 hover:text-red-500 transition-colors font-mono"
          >
            CULT: {CULT_ADDRESS}
          </a>
          <a
            href={`https://etherscan.io/address/${CultHookAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm text-gray-500 hover:text-red-500 transition-colors font-mono"
          >
            Hook: {CultHookAddress}
          </a>
          <div className="text-sm text-gray-600 font-mono">
            Pool ID: {CULT_POOL_ID.toString().slice(0, 8)}...{CULT_POOL_ID.toString().slice(-8)}
          </div>
          <a
            href="https://cult.inc/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-gray-500 hover:text-red-500 transition-colors mt-2"
          >
            cult.inc ↗
          </a>
        </div>
      </div>
    </>
  );
};
