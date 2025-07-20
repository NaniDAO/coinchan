import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  useWriteContract,
} from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PercentageSlider } from "@/components/ui/percentage-slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { handleWalletError } from "@/lib/errors";
import { formatEther, formatUnits, parseEther, parseUnits, maxUint256, encodeFunctionData, erc20Abi } from "viem";
import { CultFarmTab } from "@/components/farm/CultFarmTab";
import { ErrorBoundary } from "@/components/farm/ErrorBoundary";
import { SlippageSettings } from "@/components/SlippageSettings";
import { CULTSingleLiqETHAbi, CULTSingleLiqETHAddress } from "@/constants/CULTSingleLiqETH";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { isUserRejectionError } from "@/lib/errors";
import { ETH_TOKEN } from "@/lib/coins";
import { mainnet } from "viem/chains";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { useErc20Allowance } from "@/hooks/use-erc20-allowance";
import { CultHookAbi, CultHookAddress } from "@/constants/CultHook";
import { type TokenMeta, CULT_ADDRESS, CULT_POOL_KEY, CULT_POOL_ID } from "@/lib/coins";
import { getCultHookTaxRate, toGross } from "@/lib/cult-hook-utils";
import { CheckTheChainAbi, CheckTheChainAddress } from "@/constants/CheckTheChain";
import { DEADLINE_SEC, withSlippage, getAmountIn, getAmountOut } from "@/lib/swap";
import type { Address, Hex, PublicClient } from "viem";
import { nowSec, cn } from "./lib/utils";
import { useReserves } from "./hooks/use-reserves";
import { useBatchingSupported } from "./hooks/use-batching-supported";
import PoolPriceChart from "./components/PoolPriceChart";
import { useEthUsdPrice } from "./hooks/use-eth-usd-price";

export type Call = {
  to: Address;
  value?: bigint;
  data: Hex;
};

export interface SwapParams {
  address: `0x${string}`;
  sellToken: TokenMeta;
  sellAmt: string;
  buyAmt: string;
  reserves: { reserve0: bigint; reserve1: bigint };
  slippageBps: bigint;
  recipient?: `0x${string}`;
  exactOut?: boolean;
}

// Simplified buildSwapCalls for CULT - only handles ETH <-> CULT swaps
export async function buildSwapCalls(params: SwapParams & { publicClient: PublicClient }): Promise<Call[]> {
  const { address, sellToken, sellAmt, buyAmt, reserves, slippageBps, publicClient, recipient, exactOut } = params;

  const calls: Call[] = [];

  // Determine swap context
  const swapRecipient = recipient && /^0x[a-fA-F0-9]{40}$/.test(recipient) ? recipient : address;

  const isSellETH = sellToken.id === null;

  // 1. Fetch tax rate for CULT swaps
  const cultTaxRate = await getCultHookTaxRate();

  // 2. Bake in tax as extra slippage for minimum-out
  const effectiveSlippageBps = slippageBps + cultTaxRate;

  // 3. Parse amounts into token units (CULT always has 18 decimals)
  const sellAmtInUnits = parseUnits(sellAmt || "0", 18);
  const buyAmtInUnits = parseUnits(buyAmt || "0", 18);

  // 4. Compute min-out for swapExactIn (includes tax as slippage on CULT)
  const minBuyAmount = withSlippage(buyAmtInUnits, effectiveSlippageBps);

  // 5. Deadline
  const deadline = nowSec() + BigInt(DEADLINE_SEC);

  // 6. Compute max-in for swapExactOut
  let maxSellAmount = sellAmtInUnits;
  if (exactOut) {
    if (!reserves) {
      throw new Error("Reserves required for exactOut calculations");
    }
    const [r0, r1] = isSellETH ? [reserves.reserve0, reserves.reserve1] : [reserves.reserve1, reserves.reserve0];

    const requiredInput = getAmountIn(
      buyAmtInUnits,
      r0,
      r1,
      30n, // CULT has 0.3% swap fee
    );

    // apply only user slippage here — tax is delivered via toGross when sending ETH
    maxSellAmount = requiredInput + (requiredInput * slippageBps) / 10000n;
  }

  // 7. CULT approval check (only needed when selling CULT)
  if (!isSellETH) {
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

  // 8. Build swap call through CultHook
  if (exactOut) {
    const netMax = maxSellAmount;
    const msgValue = isSellETH ? toGross(netMax, cultTaxRate) : 0n;
    const args = [CULT_POOL_KEY, buyAmtInUnits, netMax, isSellETH, swapRecipient, deadline] as const;
    calls.push({
      to: CultHookAddress,
      data: encodeFunctionData({
        abi: CultHookAbi,
        functionName: "swapExactOut",
        args,
      }) as Hex,
      ...(isSellETH ? { value: msgValue } : {}),
    });
  } else {
    const netIn = sellAmtInUnits;
    const msgValue = isSellETH ? toGross(netIn, cultTaxRate) : 0n;
    const args = [CULT_POOL_KEY, netIn, minBuyAmount, isSellETH, swapRecipient, deadline] as const;
    calls.push({
      to: CultHookAddress,
      data: encodeFunctionData({
        abi: CultHookAbi,
        functionName: "swapExactIn",
        args,
      }) as Hex,
      ...(isSellETH ? { value: msgValue } : {}),
    });
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

// Wrapper component for SingleEthLiquidity with CULT pre-selected
const CultSingleEthLiquidity = () => {
  const { t } = useTranslation();
  const { tokens } = useAllCoins();
  const ethToken = useMemo(() => tokens.find((t) => t.id === null) || ETH_TOKEN, [tokens]);

  const [sellAmt, setSellAmt] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(500n); // 5% default slippage
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] = useState<string>("");

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({ chainId });

  const { data: reserves } = useReserves({
    poolId: CULT_POOL_ID,
    source: "COOKBOOK",
  });

  // Calculate estimated CULT output when ETH amount changes
  const syncFromSell = async (val: string) => {
    setSellAmt(val);
    if (!reserves || !val) {
      setSingleETHEstimatedCoin("");
      return;
    }

    try {
      const halfEthAmount = parseEther(val || "0") / 2n;
      
      // Fetch CULT price from CheckTheChain
      const cultPriceData = await publicClient?.readContract({
        address: CheckTheChainAddress,
        abi: CheckTheChainAbi,
        functionName: "checkPriceInETH",
        args: ["CULT"],
      });

      if (!cultPriceData) {
        throw new Error("Unable to fetch CULT price data");
      }

      const cultPriceInETH = cultPriceData[0] as bigint;
      if (cultPriceInETH === 0n) {
        throw new Error("Unable to fetch CULT price");
      }

      // Calculate CULT amount: ETH amount / CULT price
      const estimatedTokens = (halfEthAmount * 10n ** 18n) / cultPriceInETH;
      const formattedTokens = formatUnits(estimatedTokens, 18);
      setSingleETHEstimatedCoin(formattedTokens);
    } catch (err) {
      console.error("Error estimating CULT amount:", err);
      setSingleETHEstimatedCoin("");
    }
  };

  // Execute Single-Sided ETH Liquidity Provision
  const executeSingleETHLiquidity = async () => {
    if (!address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || Number.parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid ETH amount");
      return;
    }

    setTxError(null);

    try {
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet");
        return;
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const ethAmount = parseEther(sellAmt);
      const halfEthAmount = ethAmount / 2n;

      // Fetch CULT price for calculation
      const cultPriceData = await publicClient?.readContract({
        address: CheckTheChainAddress,
        abi: CheckTheChainAbi,
        functionName: "checkPriceInETH",
        args: ["CULT"],
      });

      if (!cultPriceData) {
        throw new Error("Unable to fetch CULT price");
      }

      const cultPriceInETH = cultPriceData[0] as bigint;
      const estimatedTokens = (halfEthAmount * 10n ** 18n) / cultPriceInETH;
      
      // Apply slippage
      const minTokenAmount = withSlippage(estimatedTokens, singleEthSlippageBps);
      const amount0Min = withSlippage(halfEthAmount, singleEthSlippageBps);
      const amount1Min = withSlippage(estimatedTokens, singleEthSlippageBps);

      // Use CULT single liquidity ETH contract
      const hash = await writeContractAsync({
        address: CULTSingleLiqETHAddress,
        abi: CULTSingleLiqETHAbi,
        functionName: "addSingleLiqETH",
        args: [
          CULT_POOL_KEY,
          minTokenAmount,
          amount0Min,
          amount1Min,
          address,
          deadline,
        ],
        value: ethAmount,
      });

      setTxHash(hash);
    } catch (err: unknown) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Single-sided ETH liquidity error:", err);
        setTxError(errorMsg);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* ETH Input */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-gray-400">{t("common.provide_eth")}</span>
        <Input
          type="number"
          placeholder={t("cult.amount_eth")}
          value={sellAmt}
          min="0"
          step="any"
          onChange={(e) => syncFromSell(e.currentTarget.value)}
          disabled={false}
        />
        {ethToken.balance !== undefined && ethToken.balance > 0n && (
          <button
            className="text-sm font-medium text-gray-400 hover:text-white transition-colors"
            onClick={() => {
              const ethAmount = ((ethToken.balance as bigint) * 99n) / 100n;
              syncFromSell(formatEther(ethAmount));
            }}
          >
            {t("cult.max_balance", {
              balance: formatEther(ethToken.balance),
              token: "ETH",
            })}
          </button>
        )}
      </div>

      {/* Estimated CULT Output */}
      <div className="p-3 bg-gray-900/50 border border-red-900/30 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-gray-400 text-sm">{t("common.estimated")} CULT:</span>
          <span className="text-white font-mono">
            {singleETHEstimatedCoin || "0"} CULT
          </span>
        </div>
      </div>

      {/* Slippage Settings */}
      <SlippageSettings 
        setSlippageBps={setSingleEthSlippageBps} 
        slippageBps={singleEthSlippageBps} 
      />

      {/* Info */}
      <div className="text-xs bg-gray-900/50 border border-red-900/30 rounded p-2 text-gray-400">
        <p className="font-medium mb-1">{t("pool.single_sided_eth_liquidity")}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.provide_only_eth")}</li>
          <li>Half ETH swapped to CULT via Uniswap V3</li>
          <li>Remaining ETH + CULT added to Cookbook liquidity</li>
          <li className="text-red-400">Using CULT-optimized ETH zap contract</li>
        </ul>
      </div>

      {/* Execute Button */}
      <Button
        onClick={executeSingleETHLiquidity}
        disabled={!isConnected || isPending || !sellAmt || parseFloat(sellAmt) <= 0}
        variant="default"
        className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold transition-all duration-300 shadow-lg shadow-red-500/30"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <LoadingLogo size="sm" className="scale-75" />
            {t("common.adding_liquidity")}
          </span>
        ) : (
          t("pool.add")
        )}
      </Button>

      {/* Status & Errors */}
      {txError && (
        <div className="text-sm text-red-400 mt-2 bg-red-900/20 p-2 rounded border border-red-900/30">
          {txError}
        </div>
      )}
      {(writeError && !isUserRejectionError(writeError)) && (
        <div className="text-sm text-red-400 mt-2 bg-red-900/20 p-2 rounded border border-red-900/30">
          {writeError.message}
        </div>
      )}
      {txHash && !isSuccess && (
        <div className="text-sm text-yellow-400 mt-2 bg-yellow-900/20 p-2 rounded border border-yellow-900/30">
          <div className="flex items-center justify-between">
            <span>{t("common.status_confirming")}...</span>
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-yellow-500 hover:text-yellow-400 transition-colors"
            >
              <span className="font-mono text-xs">
                {txHash.slice(0, 6)}...{txHash.slice(-4)}
              </span>
              <span className="text-xs">{t("common.external_link")}</span>
            </a>
          </div>
        </div>
      )}
      {isSuccess && (
        <div className="text-sm text-green-400 mt-2 bg-green-900/20 p-2 rounded border border-green-900/30">
          <div className="flex items-center justify-between">
            <span>{t("cult.transaction_confirmed")}</span>
            {txHash && (
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 transition-colors"
              >
                <span className="font-mono text-xs">
                  {txHash.slice(0, 6)}...{txHash.slice(-4)}
                </span>
                <span className="text-xs">{t("common.external_link")}</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const CultBuySell = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"buy" | "sell" | "add-liquidity" | "remove-liquidity" | "single-eth" | "farm">("buy");
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
  const [cultUsdPrice, setCultUsdPrice] = useState<string>("--");
  const [priceAnimating, setPriceAnimating] = useState(false);
  const [totalSupply, setTotalSupply] = useState<bigint>(0n);
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
  const { data: ethUsdPrice = 0 } = useEthUsdPrice();
  
  // Stable version of ethUsdPrice for the chart to prevent re-renders
  const [stableEthUsdPrice, setStableEthUsdPrice] = useState(ethUsdPrice);
  useEffect(() => {
    // Only update stable price if it changed significantly (more than 1%)
    if (ethUsdPrice > 0 && Math.abs(ethUsdPrice - stableEthUsdPrice) / stableEthUsdPrice > 0.01) {
      setStableEthUsdPrice(ethUsdPrice);
    }
  }, [ethUsdPrice]);

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

  // Fetch CULT total supply
  useEffect(() => {
    const fetchSupply = async () => {
      if (!publicClient) return;
      try {
        const supply = (await publicClient.readContract({
          address: CULT_ADDRESS,
          abi: erc20Abi,
          functionName: "totalSupply",
        })) as bigint;
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

  // ETH price is now fetched via useEthUsdPrice hook

  // Update CULT price from reserves
  useEffect(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return;

    const updatePrice = () => {
      try {
        // Calculate price: 1 ETH = ? CULT
        const oneEth = parseEther("1");
        const cultOut = getAmountOut(oneEth, reserves.reserve0, reserves.reserve1, 30n);
        const price = formatUnits(cultOut, 18);

        // Animate price update
        setPriceAnimating(true);
        setTimeout(() => setPriceAnimating(false), 1000);

        setCultPrice(parseFloat(price).toFixed(2));

        // Calculate USD price if we have ETH price
        if (ethUsdPrice > 0) {
          // Price of 1 CULT in ETH
          const cultPriceInEth = 1 / parseFloat(price);
          const cultPriceInUsd = cultPriceInEth * ethUsdPrice;

          // Format USD price based on magnitude
          if (cultPriceInUsd < 0.000001) {
            setCultUsdPrice(cultPriceInUsd.toExponential(2));
          } else if (cultPriceInUsd < 0.01) {
            setCultUsdPrice(cultPriceInUsd.toFixed(6));
          } else {
            setCultUsdPrice(cultPriceInUsd.toFixed(4));
          }
        }
      } catch (error) {
        console.error("Failed to calculate CULT price:", error);
      }
    };

    // Update immediately
    updatePrice();

    // Update every 9 seconds with shake animation
    const interval = setInterval(() => {
      updatePrice();
    }, 9000);

    return () => clearInterval(interval);
  }, [reserves, ethUsdPrice]);

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
  const syncLiquidityAmounts = useCallback(
    (isEthInput: boolean, value: string) => {
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
    },
    [reserves],
  );

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

          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approved,
          });
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

      const calls = await buildSwapCalls({
        address,
        sellToken,
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
          <h1 className="text-2xl font-bold text-transparent bg-gradient-to-r from-red-500 to-red-600 bg-clip-text">
            {t("cult.milady_cult_coin")}
          </h1>
          <div className={cn("text-lg font-mono mt-2", priceAnimating && "price-update")}>
            <span className="text-red-400">{t("cult.price_format", { price: cultPrice })}</span>
          </div>
          {cultUsdPrice !== "--" && (
            <div className="text-sm text-gray-400 mt-1">{t("cult.usd_per_cult", { price: cultUsdPrice })}</div>
          )}

          {/* Pool Info Display */}
          <div className="mt-4 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">{t("cult.pool_reserves")}:</span>
              <span className="text-white font-mono text-xs">
                {reserves ? (
                  <>
                    {parseFloat(formatEther(reserves.reserve0)).toFixed(4)} ETH /{" "}
                    {parseFloat(formatUnits(reserves.reserve1, 18)).toLocaleString()} CULT
                  </>
                ) : (
                  t("cult.loading")
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t("cult.total_supply")}:</span>
              <span className="text-white font-mono">
                {totalSupply > 0n ? parseFloat(formatUnits(totalSupply, 18)).toLocaleString() : "--"} CULT
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t("cult.swap_fee")}:</span>
              <span className="text-white font-mono">0.3%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">{t("cult.milady_acc_tax")}:</span>
              <span className="text-red-400 font-mono">0.1%</span>
            </div>
            {lpBalance !== undefined && lpBalance > 0n && (
              <div className="flex justify-between">
                <span className="text-gray-400">{t("cult.your_lp_tokens")}:</span>
                <span className="text-white font-mono">
                  {formatUnits(lpBalance, 18)} {t("cult.lp")}
                </span>
              </div>
            )}
          </div>

          {/* Milady Floor Charging Bar */}
          <div className="mt-4 p-4 bg-gradient-to-b from-gray-900/70 to-black/50 border border-red-900/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-red-400">{t("cult.milady_floor_charge")}</span>
              <span className="text-xs text-gray-400">
                {floorProgress > 0 && floorProgress < 100 ? "✨ " : ""}
                {floorProgress.toFixed(4)}%
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
                  <div className="text-xs text-gray-300 drop-shadow">{t("cult.eth_floor_target")}</div>
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
                {t("cult.treasury")}: 0xf164...5E02
              </a>
              <span className="text-red-400">{t("cult.tax_accumulating")}</span>
            </div>

            <div className="mt-2 text-center">
              <a
                href="https://opensea.io/collection/milady"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-400 hover:text-red-300 transition-colors inline-flex items-center gap-1"
              >
                {t("cult.view_milady_collection")}
              </a>
            </div>

            {/* Subtle note about hooks */}
            <div className="mt-3 text-xs text-gray-600 leading-relaxed">
              <span className="opacity-70">{t("cult.culthook_description")}</span>
            </div>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "buy" | "sell" | "add-liquidity" | "remove-liquidity" | "single-eth" | "farm")}
          className="relative z-10"
        >
          <TabsList className="bg-black/50 border border-red-900/30 flex flex-wrap sm:flex-nowrap overflow-x-auto">
            <TabsTrigger
              value="buy"
              className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-xs sm:text-sm"
            >
              {t("cult.buy_cult")}
            </TabsTrigger>
            <TabsTrigger
              value="sell"
              className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-xs sm:text-sm"
            >
              {t("cult.sell_cult")}
            </TabsTrigger>
            <TabsTrigger
              value="add-liquidity"
              className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-xs sm:text-sm"
            >
              {t("cult.add_liquidity")}
            </TabsTrigger>
            <TabsTrigger
              value="remove-liquidity"
              className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-xs sm:text-sm"
            >
              {t("cult.remove_liquidity")}
            </TabsTrigger>
            <TabsTrigger
              value="single-eth"
              className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-xs sm:text-sm"
            >
              {t("common.single_eth")}
            </TabsTrigger>
            <TabsTrigger
              value="farm"
              className="transition-all duration-300 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-400 text-xs sm:text-sm"
            >
              {t("cult.farm")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="max-w-2xl">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-400">{t("cult.using_eth")}</span>
              <Input
                type="number"
                placeholder={t("cult.amount_eth")}
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
                {t("cult.you_will_receive", {
                  amount: estimated,
                  token: "CULT",
                })}
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
                    {t("cult.buying")}
                  </span>
                ) : (
                  t("cult.buy_cult")
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="sell" className="max-w-2xl">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-red-600">{t("cult.using_cult")}</span>
              <div className="relative">
                <Input
                  type="number"
                  placeholder={t("cult.amount_cult")}
                  value={amount}
                  min="0"
                  step="any"
                  onChange={(e) => setAmount(e.currentTarget.value)}
                  disabled={false}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  {t("cult.you_will_receive", {
                    amount: estimated,
                    token: "ETH",
                  })}
                </span>
                {cultBalance !== undefined ? (
                  <button
                    className="self-end text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                    onClick={() => setAmount(formatUnits(cultBalance, 18))}
                    disabled={false}
                  >
                    {t("common.max")} ({formatUnits(cultBalance, 18)} CULT)
                  </button>
                ) : (
                  <button className="self-end text-sm font-medium text-gray-500" disabled={true}>
                    {t("common.max")}
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
                    {t("cult.selling")}
                  </span>
                ) : (
                  t("cult.sell_cult")
                )}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="add-liquidity" className="max-w-2xl">
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-400">{t("cult.eth_amount")}</span>
                <Input
                  type="number"
                  placeholder={t("cult.amount_eth")}
                  value={liquidityEthAmount}
                  min="0"
                  step="any"
                  onChange={(e) => syncLiquidityAmounts(true, e.currentTarget.value)}
                  disabled={false}
                />
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-red-600">{t("cult.cult_amount")}</span>
                <Input
                  type="number"
                  placeholder={t("cult.amount_cult")}
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
                    {t("cult.max_balance", {
                      balance: formatUnits(cultBalance, 18),
                      token: "CULT",
                    })}
                  </button>
                )}
              </div>

              {/* Show pool share preview */}
              {liquidityEthAmount && liquidityCultAmount && reserves && (
                <div className="mt-2 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">{t("cult.pool_share")}:</span>
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
                    {t("cult.adding_liquidity")}
                  </span>
                ) : cultAllowance !== undefined && parseUnits(liquidityCultAmount || "0", 18) > cultAllowance ? (
                  t("cult.approve_cult_add_liquidity")
                ) : (
                  t("cult.add_liquidity")
                )}
              </Button>

              <div className="text-xs text-gray-500 text-center mt-2">{t("cult.note_cult_liquidity")}</div>
            </div>
          </TabsContent>

          <TabsContent value="remove-liquidity" className="max-w-2xl">
            <div className="flex flex-col gap-4">
              {/* LP Balance Display */}
              <div className="p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">{t("cult.your_lp_balance")}:</span>
                  <span className="text-white font-mono">
                    {lpBalance ? formatUnits(lpBalance, 18) : "0"} {t("cult.lp")}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-gray-400">{t("cult.lp_tokens_to_remove")}</span>
                <Input
                  type="number"
                  placeholder={t("cult.amount_of_lp_tokens")}
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
                    {t("cult.max_balance", {
                      balance: formatUnits(lpBalance, 18),
                      token: t("cult.lp"),
                    })}
                  </button>
                )}
              </div>

              {/* Expected output preview */}
              {lpBurnAmount && parseFloat(lpBurnAmount) > 0 && (
                <div className="mt-2 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-2">
                  <div className="text-gray-400 mb-1">{t("cult.you_will_receive_preview")}</div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ETH:</span>
                    <span className="text-white font-mono">{parseFloat(expectedEth).toFixed(6)} ETH</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">CULT:</span>
                    <span className="text-white font-mono">{parseFloat(expectedCult).toLocaleString()} CULT</span>
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
                    {t("cult.removing_liquidity")}
                  </span>
                ) : (
                  t("cult.remove_liquidity")
                )}
              </Button>

              <div className="text-xs text-gray-500 text-center mt-2">{t("cult.note_liquidity_removal")}</div>
            </div>
          </TabsContent>

          <TabsContent value="single-eth" className="max-w-2xl">
            <CultSingleEthLiquidity />
          </TabsContent>

          <TabsContent value="farm" className="max-w-4xl">
            <ErrorBoundary>
              <CultFarmTab />
            </ErrorBoundary>
          </TabsContent>

          {/* Transaction Status & Error Messages */}
          {errorMessage && !txHash && (
            <div className="text-sm text-red-400 mt-2 bg-red-900/20 p-2 rounded border border-red-900/30">
              {errorMessage}
            </div>
          )}
          {txHash && !isSuccess && (
            <div className="text-sm text-yellow-400 mt-2 bg-yellow-900/20 p-2 rounded border border-yellow-900/30">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <LoadingLogo size="sm" className="scale-75" />
                  {t("common.status_confirming")}...
                </span>
                <a
                  href={`https://etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-yellow-500 hover:text-yellow-400 transition-colors"
                >
                  <span className="font-mono text-xs">
                    {txHash.slice(0, 6)}...{txHash.slice(-4)}
                  </span>
                  <span className="text-xs">{t("common.external_link")}</span>
                </a>
              </div>
            </div>
          )}
          {isSuccess && (
            <div className="text-sm text-green-400 mt-2 bg-green-900/20 p-2 rounded border border-green-900/30">
              <div className="flex items-center justify-between">
                <span>{t("cult.transaction_confirmed")}</span>
                {txHash && (
                  <a
                    href={`https://etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-green-500 hover:text-green-400 transition-colors"
                  >
                    <span className="font-mono text-xs">
                      {txHash.slice(0, 6)}...{txHash.slice(-4)}
                    </span>
                    <span className="text-xs">{t("common.external_link")}</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </Tabs>
        <div className="mt-5">
          <PoolPriceChart poolId={CULT_POOL_ID.toString()} ticker="CULT" ethUsdPrice={stableEthUsdPrice} />
        </div>
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
            {t("cult.hook")}: {CultHookAddress}
          </a>
          <div className="text-sm text-gray-600 font-mono">
            {t("cult.pool_id")}: {CULT_POOL_ID.toString().slice(0, 8)}...
            {CULT_POOL_ID.toString().slice(-8)}
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
