import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { ArrowUpDown, Plus, Minus, Zap, Sparkles, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { handleWalletError } from "@/lib/errors";
import { formatEther, formatUnits, parseEther, parseUnits, maxUint256, encodeFunctionData, erc20Abi } from "viem";
import { CultFarmTab } from "@/components/farm/CultFarmTab";
import { ErrorBoundary } from "@/components/farm/ErrorBoundary";
import { SlippageSettings } from "@/components/SlippageSettings";
import { CultSwapTile } from "@/components/CultSwapTile";
import { CULTSingleLiqETHAbi, CULTSingleLiqETHAddress } from "@/constants/CULTSingleLiqETH";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useETHPrice } from "@/hooks/use-eth-price";
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
import { nowSec, cn, formatNumber } from "./lib/utils";
import { useReserves } from "./hooks/use-reserves";
import PoolPriceChart from "./components/PoolPriceChart";
import { useEthUsdPrice } from "./hooks/use-eth-usd-price";
import { TokenPairIcon } from "./components/TokenPairIcon";

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

// Helper function to calculate square root for LP token calculation
const sqrt = (value: bigint): bigint => {
  if (value < 0n) {
    throw new Error("Square root of negative numbers is not supported");
  }
  if (value === 0n) return 0n;

  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
};

// Wrapper component for SingleEthLiquidity with CULT pre-selected
const CultSingleEthLiquidity = () => {
  const { t } = useTranslation();
  const { tokens } = useAllCoins();
  const ethToken = useMemo(() => tokens.find((t) => t.id === null) || ETH_TOKEN, [tokens]);
  const { data: ethPrice } = useETHPrice();

  const [sellAmt, setSellAmt] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(1000n); // 10% default slippage for CULT
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] = useState<string>("");
  const [estimatedLpTokens, setEstimatedLpTokens] = useState<string>("");
  const [estimatedPoolShare, setEstimatedPoolShare] = useState<string>("");

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({ chainId });

  const { data: reserves } = useReserves({
    poolId: CULT_POOL_ID,
    source: "COOKBOOK",
  });

  // Fetch pool info for total LP supply
  const { data: poolInfo } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "pools",
    args: [CULT_POOL_ID],
    chainId: mainnet.id,
  });

  // Calculate estimated CULT output when ETH amount changes
  const syncFromSell = async (val: string) => {
    setSellAmt(val);
    if (!reserves || !val) {
      setSingleETHEstimatedCoin("");
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
      return;
    }

    try {
      const ethAmount = parseEther(val || "0");
      const halfEthAmount = ethAmount / 2n;

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

      // Calculate expected LP tokens and pool share
      if (poolInfo) {
        const totalSupply = poolInfo[6] as bigint; // Total LP supply at index 6

        // Calculate how many LP tokens will be minted
        // Using the standard liquidity formula: sqrt(x * y)
        // But since we're adding to existing pool, we use the proportional formula

        // The remaining half ETH will be added as liquidity along with the swapped CULT
        const ethLiquidity = halfEthAmount;
        const cultLiquidity = estimatedTokens;

        // Calculate LP tokens based on the AMM formula
        if (totalSupply > 0n && reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
          // From AMM: liquidity = min(mulDiv(amount0, supply, reserve0), mulDiv(amount1, supply, reserve1))
          const lpFromEth = (ethLiquidity * totalSupply) / reserves.reserve0;
          const lpFromCult = (cultLiquidity * totalSupply) / reserves.reserve1;
          const lpTokensToMint = lpFromEth < lpFromCult ? lpFromEth : lpFromCult;

          setEstimatedLpTokens(formatUnits(lpTokensToMint, 18));

          // Calculate pool share percentage
          const newTotalSupply = totalSupply + lpTokensToMint;
          const poolShareBps = (lpTokensToMint * 10000n) / newTotalSupply;
          setEstimatedPoolShare(`${(Number(poolShareBps) / 100).toFixed(2)}%`);
        } else if (totalSupply === 0n) {
          // First liquidity provider - from AMM: liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
          const MINIMUM_LIQUIDITY = 1000n;
          const lpTokens = sqrt(ethLiquidity * cultLiquidity) - MINIMUM_LIQUIDITY;
          setEstimatedLpTokens(formatUnits(lpTokens, 18));
          setEstimatedPoolShare("100%");
        }
      }
    } catch (err) {
      console.error("Error estimating CULT amount:", err);
      setSingleETHEstimatedCoin("");
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
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
        args: [CULT_POOL_KEY, minTokenAmount, amount0Min, amount1Min, address, deadline],
        value: ethAmount,
      });

      setTxHash(hash);
    } catch (err: unknown) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
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
        <span className="text-sm font-medium text-muted-foreground">{t("common.provide_eth")}</span>
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
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
          <span className="text-muted-foreground text-sm">{t("common.estimated")} CULT:</span>
          <div className="text-right">
            <span className="text-white font-mono block">
              {singleETHEstimatedCoin ? formatNumber(parseFloat(singleETHEstimatedCoin), 6) : "0"} CULT
            </span>
            {ethPrice?.priceUSD && singleETHEstimatedCoin && reserves && (
              <span className="text-xs text-muted-foreground">
                ≈ ${(() => {
                  const cultAmount = parseFloat(singleETHEstimatedCoin);
                  const ethAmount = parseFloat(formatEther(reserves.reserve0));
                  const cultTotalAmount = parseFloat(formatUnits(reserves.reserve1, 18));
                  const cultPriceInEth = ethAmount / cultTotalAmount;
                  const cultPriceUsd = cultPriceInEth * ethPrice.priceUSD;
                  return formatNumber(cultAmount * cultPriceUsd, 2);
                })()} {t("common.usd")}
              </span>
            )}
          </div>
        </div>

        {/* LP Tokens and Pool Share */}
        {estimatedLpTokens && estimatedPoolShare && (
          <>
            <div className="mt-2 pt-2 border-t border-red-900/20 flex justify-between items-center">
              <span className="text-muted-foreground text-sm">{t("common.estimated_lp_tokens")}:</span>
              <span className="text-white font-mono">{parseFloat(estimatedLpTokens).toFixed(6)} LP</span>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span className="text-muted-foreground text-sm">{t("cult.pool_share")}:</span>
              <span className="text-white font-mono">{estimatedPoolShare}</span>
            </div>
          </>
        )}

        {ethPrice?.priceUSD && sellAmt && (
          <div className="mt-2 pt-2 border-t border-red-900/20 text-xs text-muted-foreground">
            <span>
              {t("common.eth_input")}: ≈ ${formatNumber(parseFloat(sellAmt) * ethPrice.priceUSD, 2)} {t("common.usd")}
            </span>
          </div>
        )}
      </div>

      {/* Slippage Settings */}
      <SlippageSettings setSlippageBps={setSingleEthSlippageBps} slippageBps={singleEthSlippageBps} />

      {/* Info */}
      <div className="text-xs bg-muted/50 dark:bg-gray-900/50 border border-red-900/30 rounded p-2 text-muted-foreground">
        <p className="font-medium mb-1">{t("pool.single_sided_eth_liquidity")}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.provide_only_eth")}</li>
          <li>{t("cult.half_eth_swapped_uniswap")}</li>
          <li>{t("cult.remaining_eth_cult_added")}</li>
          <li className="text-red-400">{t("cult.using_cult_optimized_zap")}</li>
          <li className="text-red-400">{t("cult.default_slippage_cult")}</li>
        </ul>
        <p className="mt-2 text-yellow-400/80 text-xs">{t("cult.wallet_simulations_dust")}</p>
      </div>

      {/* Execute Button */}
      <Button
        onClick={executeSingleETHLiquidity}
        disabled={!isConnected || isPending || !sellAmt || parseFloat(sellAmt) <= 0}
        variant="default"
        className="w-full font-bold transition-all duration-300 shadow-lg shadow-primary/30"
        style={{
          backgroundColor: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
        }}
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
        <div className="text-sm text-red-400 mt-2 bg-red-900/20 p-2 rounded border border-red-900/30">{txError}</div>
      )}
      {writeError && !isUserRejectionError(writeError) && (
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

const CultHookDescription = () => {
  const { t } = useTranslation();
  
  // Split the description to insert links
  const description = t("cult.culthook_description");
  const parts = description.split(/(\bMILADY\b|\bJustice DAO\b)/g);
  
  return (
    <span>
      {parts.map((part, index) => {
        if (part === "MILADY") {
          return (
            <a
              key={index}
              href="https://etherscan.io/address/0x227c7DF69D3ed1ae7574A1a7685fDEd90292EB48"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400 underline"
            >
              {t("cult.milady_link")}
            </a>
          );
        } else if (part === "Justice DAO") {
          return (
            <a
              key={index}
              href="https://wewantjusticedao.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-400 underline"
            >
              {t("cult.justice_dao_link")}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

export const CultBuySell = () => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"swap" | "add-liquidity" | "remove-liquidity" | "single-eth" | "farm">("swap");
  // Swap amount is now handled in CultSwapTile component
  const [liquidityEthAmount, setLiquidityEthAmount] = useState("");
  const [liquidityCultAmount, setLiquidityCultAmount] = useState("");
  const [lpBurnAmount, setLpBurnAmount] = useState("");
  const [expectedEth, setExpectedEth] = useState("0");
  const [expectedCult, setExpectedCult] = useState("0");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Buy percentage is now handled in CultSwapTile component
  const [cultPrice, setCultPrice] = useState<string>("--.--.--");
  const [cultUsdPrice, setCultUsdPrice] = useState<string>("--");
  const [priceAnimating, setPriceAnimating] = useState(false);
  // Slippage is now handled in CultSwapTile component
  // Price impact is handled in CultSwapTile component
  const [optimisticPriceUpdate, setOptimisticPriceUpdate] = useState<{
    timestamp: number;
    price: number;
    priceInEth: number;
    action: "buy" | "sell";
    amount: string;
  } | null>(null);
  const [arbitrageInfo, setArbitrageInfo] = useState<{
    type: "swap" | "zap"; // Which tab to highlight
    cultFromUniV3: number;
    cultFromCookbook: number;
    percentGain: number;
    testAmountETH: string; // Amount of ETH used for calculation
  } | null>(null);

  // Price impact is now calculated in CultSwapTile component

  const { address, isConnected } = useAccount();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { data: ethPrice } = useETHPrice();
  // Batching is handled in CultSwapTile if needed
  const { isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
    onReplaced: () => {
      // Clear optimistic update if transaction is replaced
      setOptimisticPriceUpdate(null);
    },
  });
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { data: ethUsdPrice = 0 } = useEthUsdPrice();

  // Stable version of ethUsdPrice for the chart to prevent re-renders
  const [stableEthUsdPrice, setStableEthUsdPrice] = useState(0);
  useEffect(() => {
    // Only update stable price if it changed significantly (more than 1%)
    if (ethUsdPrice > 0) {
      if (stableEthUsdPrice === 0 || Math.abs(ethUsdPrice - stableEthUsdPrice) / stableEthUsdPrice > 0.01) {
        setStableEthUsdPrice(ethUsdPrice);
      }
    }
  }, [ethUsdPrice, stableEthUsdPrice]);

  // Fetch ETH balance
  const { data: ethBalance } = useBalance({
    address: address,
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

  // Batch multiple contract reads for better performance
  const { data: contractData } = useReadContracts({
    contracts: [
      {
        address: CULT_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
      },
      {
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "balanceOf",
        args: address ? [address, CULT_POOL_ID] : undefined,
      },
      {
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "pools",
        args: [CULT_POOL_ID],
      },
    ],
    allowFailure: false,
  });

  const cultBalance = contractData?.[0];
  const lpBalance = contractData?.[1];
  const poolInfo = contractData?.[2];
  // Treasury balance and total supply removed - not currently used

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
    tokenUri: "/cult.jpg", // Use the CULT logo image
  };


  // ETH price is now fetched via useEthUsdPrice hook

  // Update CULT price from reserves
  useEffect(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return;

    const updatePrice = () => {
      try {
        // Calculate spot price from reserves (without swap fee)
        // Price = reserve1 / reserve0 (CULT per ETH)
        const spotPrice = (reserves.reserve1 * parseEther("1")) / reserves.reserve0;
        const price = formatUnits(spotPrice, 18);

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

  // Check for arbitrage opportunities between Uniswap V3 and Cookbook
  useEffect(() => {
    if (!reserves || !publicClient || reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
      setArbitrageInfo(null);
      return;
    }

    let cancelled = false;
    
    const checkArbitrage = async () => {
      try {
        // Test with 0.1 ETH
        const testAmount = parseEther("0.1");
        const testAmountString = "0.1";
        const halfTestAmount = testAmount / 2n;

        // 1. Calculate CULT from direct Cookbook swap
        const cultFromCookbook = getAmountOut(testAmount, reserves.reserve0, reserves.reserve1, 30n);

        // 2. Calculate CULT from Uniswap V3 price oracle (CheckTheChain)
        const cultPriceData = await publicClient.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPriceInETH",
          args: ["CULT"],
        });

        if (!cultPriceData || !cultPriceData[0]) {
          return;
        }

        const cultPriceInETH = cultPriceData[0] as bigint;
        if (cultPriceInETH === 0n) return;

        // Calculate how much CULT we'd get from Uniswap V3 for half the ETH
        const cultFromUniV3Half = (halfTestAmount * 10n ** 18n) / cultPriceInETH;
        // Double it to compare with full amount swap
        const cultFromUniV3 = cultFromUniV3Half * 2n;

        // Compare the two
        if (cultFromCookbook > cultFromUniV3) {
          // Cookbook gives more CULT - highlight SWAP tab
          const extraCULT = cultFromCookbook - cultFromUniV3;
          const percentGain = Number((extraCULT * 10000n) / cultFromUniV3) / 100;

          if (percentGain > 0.5 && !cancelled) {
            setArbitrageInfo({
              type: "swap",
              cultFromUniV3: Number(formatUnits(cultFromUniV3, 18)),
              cultFromCookbook: Number(formatUnits(cultFromCookbook, 18)),
              percentGain,
              testAmountETH: testAmountString,
            });
          }
        } else if (cultFromUniV3 > cultFromCookbook * 102n / 100n) { // Add 2% buffer for fees
          // Uniswap gives more CULT - highlight ZAP tab
          const extraCULT = cultFromUniV3 - cultFromCookbook;
          const percentGain = Number((extraCULT * 10000n) / cultFromCookbook) / 100;

          if (percentGain > 0.5 && !cancelled) {
            setArbitrageInfo({
              type: "zap",
              cultFromUniV3: Number(formatUnits(cultFromUniV3, 18)),
              cultFromCookbook: Number(formatUnits(cultFromCookbook, 18)),
              percentGain,
              testAmountETH: testAmountString,
            });
          }
        } else if (!cancelled) {
          // No significant difference
          setArbitrageInfo(null);
        }
      } catch (error) {
        console.error("Failed to check CULT arbitrage:", error);
      }
    };

    checkArbitrage();
    const interval = setInterval(checkArbitrage, 30000); // Check every 30 seconds

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [reserves, publicClient]);

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

  // Buy percentage handling is now in CultSwapTile

  // Reset amounts when switching tabs
  useEffect(() => {
    setLiquidityEthAmount("");
    setLiquidityCultAmount("");
    setLpBurnAmount("");
    setExpectedEth("0");
    setExpectedCult("0");
    setTxHash(undefined);
    setErrorMessage(null);
    setOptimisticPriceUpdate(null);
  }, [tab]);

  // Price impact calculation is now handled in CultSwapTile component

  // Mark optimistic update as settled when transaction confirms
  useEffect(() => {
    if (isSuccess && optimisticPriceUpdate) {
      // Clear after a delay to show settled state
      const timer = setTimeout(() => {
        setOptimisticPriceUpdate(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isSuccess, optimisticPriceUpdate]);

  // Buy percentage calculation is now handled in CultSwapTile component

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
          const errorMsg = handleWalletError(err, {
            defaultMessage: t("errors.transaction_error"),
          });
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
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
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
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  // Swap execution is now handled in CultSwapTile component

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: priceUpdateAnimation }} />
      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-2xl w-full mx-auto p-4 cult-container">
          <div className="text-center mb-6">
            <img
              src="/cult.jpg"
              alt="CULT Logo"
              className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-red-500 shadow-lg shadow-red-500/30 hover:scale-105 transition-transform"
            />
            <h1 className="text-3xl font-display text-foreground tracking-tight">{t("cult.milady_cult_coin")}</h1>
            <div className={cn("text-xl font-mono mt-3 text-foreground", priceAnimating && "price-update")}>
              <span className="block">
                {t("cult.price_format", {
                  price: formatNumber(parseFloat(cultPrice), 2),
                })}
              </span>
            </div>
            {cultUsdPrice !== "--" && (
              <div className="text-sm text-muted-foreground mt-1">
                {t("cult.usd_per_cult", { price: cultUsdPrice })}
              </div>
            )}

          </div>

          <Tabs
            value={tab}
            onValueChange={(v) =>
              setTab(v as "swap" | "add-liquidity" | "remove-liquidity" | "single-eth" | "farm")
            }
            className="relative z-10"
          >
            {/* Arbitrage notification */}
            {arbitrageInfo && tab !== arbitrageInfo.type && tab !== "single-eth" && (
              <div className="mb-2 flex justify-center sm:justify-end">
                <button
                  onClick={() => setTab(arbitrageInfo.type === "zap" ? "single-eth" : "swap")}
                  className="group relative flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full hover:bg-green-200 dark:hover:bg-green-900/50 transition-all animate-pulse hover:animate-none"
                >
                  <TrendingUp className="h-3 w-3" />
                  {arbitrageInfo.type === "swap" ? (
                    <>
                      <span className="hidden sm:inline text-muted-foreground">{arbitrageInfo.testAmountETH} ETH</span>
                      <span className="sm:hidden text-muted-foreground text-[10px]">
                        {arbitrageInfo.testAmountETH.slice(0, 4)} ETH
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="flex items-center gap-0.5 sm:gap-1 font-medium">
                        <span className="hidden sm:inline">{formatNumber(arbitrageInfo.cultFromCookbook, 0)}</span>
                        <span className="sm:hidden text-[10px]">{formatNumber(arbitrageInfo.cultFromCookbook, 0)}</span>
                        <span>CULT</span>
                      </span>
                      <span className="ml-0.5 sm:ml-1 font-semibold text-green-600 dark:text-green-400 text-[10px] sm:text-xs">
                        +{arbitrageInfo.percentGain.toFixed(1)}%
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Sparkles className="h-3 w-3 flex-shrink-0" />
                      <span className="flex items-center gap-0.5 sm:gap-1">
                        <span className="font-medium flex items-center gap-0.5">
                          <span className="hidden sm:inline">{formatNumber(arbitrageInfo.cultFromUniV3, 0)}</span>
                          <span className="sm:hidden text-[10px]">{formatNumber(arbitrageInfo.cultFromUniV3, 0)}</span>
                          <span>CULT</span>
                        </span>
                        <span className="font-semibold text-green-600 dark:text-green-400 text-[10px] sm:text-xs">
                          +{arbitrageInfo.percentGain.toFixed(1)}%
                        </span>
                      </span>
                      <ArrowRight className="h-3 w-3 flex-shrink-0" />
                      <span className="flex items-center gap-0.5 sm:gap-1">
                        <Zap className="h-3 w-3 flex-shrink-0" />
                        <span className="font-medium text-[10px] sm:text-xs">{t("common.single_eth")}</span>
                      </span>
                    </div>
                  )}
                </button>
              </div>
            )}
            <TabsList className="flex flex-wrap sm:grid sm:grid-cols-5 gap-1 bg-red-900/5 dark:bg-red-900/10 p-1 h-auto w-full">
              <TabsTrigger
                value="swap"
                className={`relative flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-red-900/20 dark:data-[state=active]:bg-red-900/30 data-[state=active]:text-red-400 dark:data-[state=active]:text-white transition-all duration-200 ${
                  arbitrageInfo?.type === "swap" && tab !== "swap" ? "ring-1 ring-green-400/50" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <ArrowUpDown className="h-3 w-3" />
                  <span>{t("common.swap")}</span>
                </div>
                {arbitrageInfo?.type === "swap" && tab !== "swap" && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="add-liquidity"
                className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-red-900/20 dark:data-[state=active]:bg-red-900/30 data-[state=active]:text-red-400 dark:data-[state=active]:text-white transition-all duration-200"
              >
                <div className="flex items-center gap-1.5">
                  <TokenPairIcon token1Symbol="ETH" token2Symbol="CULT" size="sm" />
                  <Plus className="h-3 w-3" />
                  <span>{t("common.add")}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="remove-liquidity"
                className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-red-900/20 dark:data-[state=active]:bg-red-900/30 data-[state=active]:text-red-400 dark:data-[state=active]:text-white transition-all duration-200"
              >
                <div className="flex items-center gap-1.5">
                  <TokenPairIcon token1Symbol="ETH" token2Symbol="CULT" size="sm" />
                  <Minus className="h-3 w-3" />
                  <span>{t("common.remove")}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger
                value="single-eth"
                className={`flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-red-900/20 dark:data-[state=active]:bg-red-900/30 data-[state=active]:text-red-400 dark:data-[state=active]:text-white transition-all duration-200 ${
                  arbitrageInfo?.type === "zap" && tab !== "single-eth" ? "ring-1 ring-green-400/50" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3" />
                  <span>{t("common.single_eth")}</span>
                </div>
                {arbitrageInfo?.type === "zap" && tab !== "single-eth" && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="farm"
                className="flex-1 sm:flex-initial px-2 py-1.5 text-xs sm:text-sm data-[state=active]:bg-red-900/20 dark:data-[state=active]:bg-red-900/30 data-[state=active]:text-red-400 dark:data-[state=active]:text-white transition-all duration-200"
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3" />
                  <span>{t("cult.farm")}</span>
                </div>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="swap" className="mt-2 sm:mt-4">
              <div className="bg-muted/20 dark:bg-black/20 p-4 rounded-lg border border-red-900/20">
                <CultSwapTile
                  ethToken={ethToken}
                  cultToken={cultToken}
                  reserves={reserves || null}
                  ethBalance={ethBalance?.value || 0n}
                  cultBalance={cultBalance || 0n}
                  onTransactionComplete={() => {
                    // Refetch balances after swap
                    refetchCultAllowance();
                  }}
                  onPriceImpactChange={() => {}}
                  arbitrageInfo={arbitrageInfo?.type === "swap" ? arbitrageInfo : null}
                />
              </div>
              
              {/* Pool Info - Subtle display below swap */}
              <div className="mt-4 flex justify-between items-center text-xs text-muted-foreground">
                <div className="flex gap-4">
                  <div>
                    <span className="opacity-70">ETH in Pool</span>
                    <div className="font-mono">
                      {reserves ? formatNumber(parseFloat(formatEther(reserves.reserve0)), 4) : "--"}
                    </div>
                  </div>
                  <div>
                    <span className="opacity-70">CULT in Pool</span>
                    <div className="font-mono">
                      {reserves ? formatNumber(parseFloat(formatUnits(reserves.reserve1, 18)), 0) : "--"}
                    </div>
                  </div>
                </div>
                {ethPrice?.priceUSD && reserves && reserves.reserve0 > 0n && reserves.reserve1 > 0n && (
                  <div className="text-right">
                    <span className="opacity-70">TVL</span>
                    <div className="font-mono">
                      ${formatNumber(parseFloat(formatEther(reserves.reserve0)) * ethPrice.priceUSD * 2, 2)}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Fees - Subtle display */}
              <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="opacity-70">Swap Fee:</span>
                  <span className="font-mono">0.3%</span>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <span className="text-[10px] opacity-50 cursor-help hover:opacity-100 transition-opacity">
                        ⓘ
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-auto">
                      <p className="text-sm">{t("common.paid_to_lps")}</p>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <div className="flex items-center gap-1">
                  <span className="opacity-70">Milady Tax:</span>
                  <span className="font-mono">0.1%</span>
                  <HoverCard>
                    <HoverCardTrigger asChild>
                      <span className="text-[10px] opacity-50 cursor-help hover:opacity-100 transition-opacity">
                        ⓘ
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80">
                      <p className="text-sm"><CultHookDescription /></p>
                    </HoverCardContent>
                  </HoverCard>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="add-liquidity" className="mt-2 sm:mt-4">
              <div className="bg-muted/20 dark:bg-black/20 p-4 rounded-lg border border-red-900/20">
                <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">{t("cult.eth_amount")}</span>
                  <Input
                    type="number"
                    placeholder={t("cult.amount_eth")}
                    value={liquidityEthAmount}
                    min="0"
                    step="any"
                    onChange={(e) => syncLiquidityAmounts(true, e.currentTarget.value)}
                    disabled={false}
                  />
                  <div className="flex flex-col gap-1">
                    {ethPrice?.priceUSD && liquidityEthAmount && (
                      <span className="text-xs text-muted-foreground">
                        ≈ ${formatNumber(parseFloat(liquidityEthAmount) * ethPrice.priceUSD, 2)} {t("common.usd")}
                      </span>
                    )}
                    {ethBalance && (
                      <button
                        className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                        onClick={() => {
                          const maxEth = (ethBalance.value * 99n) / 100n; // Leave 1% for gas
                          syncLiquidityAmounts(true, formatEther(maxEth));
                        }}
                        disabled={false}
                      >
                        {t("cult.max_balance", {
                          balance: formatEther((ethBalance.value * 99n) / 100n),
                          token: "ETH",
                        })}
                      </button>
                    )}
                  </div>
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
                  <div className="flex flex-col gap-1">
                    {ethPrice?.priceUSD && liquidityCultAmount && reserves && (
                      <span className="text-xs text-muted-foreground">
                        ≈ ${(() => {
                          const cultAmount = parseFloat(liquidityCultAmount);
                          const ethAmount = parseFloat(formatEther(reserves.reserve0));
                          const cultTotalAmount = parseFloat(formatUnits(reserves.reserve1, 18));
                          const cultPriceInEth = ethAmount / cultTotalAmount;
                          const cultPriceUsd = cultPriceInEth * ethPrice.priceUSD;
                          return formatNumber(cultAmount * cultPriceUsd, 2);
                        })()} {t("common.usd")}
                      </span>
                    )}
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
                </div>

                {/* Show pool share preview */}
                {liquidityEthAmount && liquidityCultAmount && reserves && (
                  <div className="mt-2 p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("cult.pool_share")}:</span>
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
                  className="font-bold transition-all duration-300 shadow-lg shadow-primary/30"
                  style={{
                    backgroundColor: "hsl(var(--primary))",
                    color: "hsl(var(--primary-foreground))",
                  }}
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

                <div className="text-xs text-muted-foreground text-center mt-2">{t("cult.note_cult_liquidity")}</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="remove-liquidity" className="mt-2 sm:mt-4">
              <div className="bg-muted/20 dark:bg-black/20 p-4 rounded-lg border border-red-900/20">
                <div className="flex flex-col gap-4">
                {/* LP Balance Display */}
                <div className="p-3 bg-gray-900/50 border border-red-900/30 rounded-lg text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{t("cult.your_lp_balance")}:</span>
                    <span className="text-white font-mono">
                      {lpBalance ? formatUnits(lpBalance, 18) : "0"} {t("cult.lp")}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">{t("cult.lp_tokens_to_remove")}</span>
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
                    <div className="text-muted-foreground mb-1">{t("cult.you_will_receive_preview")}</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ETH:</span>
                      <div className="text-right">
                        <span className="text-white font-mono block">
                          {formatNumber(parseFloat(expectedEth), 6)} ETH
                        </span>
                        {ethPrice?.priceUSD && expectedEth !== "0" && (
                          <span className="text-xs text-muted-foreground">
                            ≈ ${formatNumber(parseFloat(expectedEth) * ethPrice.priceUSD, 2)} {t("common.usd")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CULT:</span>
                      <div className="text-right">
                        <span className="text-white font-mono block">
                          {formatNumber(parseFloat(expectedCult), 0)} CULT
                        </span>
                        {ethPrice?.priceUSD && expectedCult !== "0" && reserves && (
                          <span className="text-xs text-muted-foreground">
                            ≈ ${(() => {
                              const cultAmount = parseFloat(expectedCult);
                              const ethAmount = parseFloat(formatEther(reserves.reserve0));
                              const cultTotalAmount = parseFloat(formatUnits(reserves.reserve1, 18));
                              const cultPriceInEth = ethAmount / cultTotalAmount;
                              const cultPriceUsd = cultPriceInEth * ethPrice.priceUSD;
                              return formatNumber(cultAmount * cultPriceUsd, 2);
                            })()} {t("common.usd")}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Total USD value */}
                    {ethPrice?.priceUSD &&
                      expectedEth !== "0" &&
                      expectedCult !== "0" &&
                      reserves &&
                      reserves.reserve0 > 0n &&
                      reserves.reserve1 > 0n && (
                        <div className="pt-2 mt-2 border-t border-red-900/20">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground font-semibold">{t("common.total_value")}:</span>
                            <span className="text-white font-mono font-semibold">
                              ${(() => {
                                const ethValue = parseFloat(expectedEth) * ethPrice.priceUSD;
                                const cultAmount = parseFloat(expectedCult);
                                const ethReserve = parseFloat(formatEther(reserves.reserve0));
                                const cultReserve = parseFloat(formatUnits(reserves.reserve1, 18));
                                const cultPriceInEth = ethReserve / cultReserve;
                                const cultValue = cultAmount * cultPriceInEth * ethPrice.priceUSD;
                                return (ethValue + cultValue).toFixed(2);
                              })()} USD
                            </span>
                          </div>
                        </div>
                      )}
                  </div>
                )}

                <Button
                  onClick={executeRemoveLiquidity}
                  disabled={!isConnected || isPending || !lpBurnAmount || parseFloat(lpBurnAmount) <= 0}
                  variant="default"
                  className="font-bold transition-all duration-300 shadow-lg shadow-primary/30"
                  style={{
                    backgroundColor: "hsl(var(--primary))",
                    color: "hsl(var(--primary-foreground))",
                  }}
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

                <div className="text-xs text-muted-foreground text-center mt-2">{t("cult.note_liquidity_removal")}</div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="single-eth" className="mt-2 sm:mt-4">
              <div className="bg-muted/20 dark:bg-black/20 p-4 rounded-lg border border-red-900/20">
                <CultSingleEthLiquidity />
              </div>
            </TabsContent>

            <TabsContent value="farm" className="mt-2 sm:mt-4">
              <div className="bg-muted/20 dark:bg-black/20 p-4 rounded-lg border border-red-900/20">
                <ErrorBoundary>
                  <CultFarmTab />
                </ErrorBoundary>
              </div>
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
            <ErrorBoundary
              fallback={
                <div className="p-8 text-center bg-black/20 border border-red-900/20 rounded">
                  <p className="text-red-400 mb-2">{t("errors.chart_error")}</p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-sm text-muted-foreground underline hover:text-gray-300"
                  >
                    {t("common.refresh_page")}
                  </button>
                </div>
              }
            >
              <PoolPriceChart
                poolId={CULT_POOL_ID.toString()}
                ticker="CULT"
                ethUsdPrice={stableEthUsdPrice}
                priceImpact={null}
                defaultTimeRange="all"
              />
            </ErrorBoundary>
          </div>
          {/* Contract Links */}
          <div className="mt-8 text-center space-y-2">
            <a
              href={`https://etherscan.io/address/${CULT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted-foreground hover:text-red-500 transition-colors font-mono"
            >
              CULT: {CULT_ADDRESS}
            </a>
            <a
              href={`https://etherscan.io/address/${CultHookAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-sm text-muted-foreground hover:text-red-500 transition-colors font-mono"
            >
              {t("cult.hook")}: {CultHookAddress}
            </a>
            <div className="text-sm text-muted-foreground/80 font-mono">
              {t("cult.pool_id")}: {CULT_POOL_ID.toString().slice(0, 8)}...
              {CULT_POOL_ID.toString().slice(-8)}
            </div>
            <a
              href="https://cult.inc/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-muted-foreground hover:text-red-500 transition-colors mt-2"
            >
              cult.inc ↗
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

