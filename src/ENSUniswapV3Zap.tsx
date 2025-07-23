import { CheckIcon, Loader2, X, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useChainId, usePublicClient, useWaitForTransactionReceipt, useSendTransaction } from "wagmi";
import { NetworkError } from "./components/NetworkError";
import { SlippageSettings } from "./components/SlippageSettings";
import { SwapPanel } from "./components/SwapPanel";
import { ENSLogo } from "./components/icons/ENSLogo";
import { ENSZapAbi, ENSZapAddress } from "./constants/ENSZap";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useReserves } from "./hooks/use-reserves";
import { ETH_TOKEN, ENS_TOKEN, ENS_POOL_ID } from "./lib/coins";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { getAmountOut } from "./lib/swap";
import { formatNumber } from "./lib/utils";

// Helper function to calculate square root for LP token calculation
const sqrt = (value: bigint): bigint => {
  if (value < 0n) {
    throw new Error("Square root of negative numbers is not supported"); // Technical error, no translation needed
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

export const ENSUniswapV3Zap = () => {
  const { t } = useTranslation();
  /* State */
  const [sellAmt, setSellAmt] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(1000n); // 10% for ENS
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] = useState<string>("");
  const [estimatedLpTokens, setEstimatedLpTokens] = useState<string>("");
  const [estimatedPoolShare, setEstimatedPoolShare] = useState<string>("");
  const [oracleInSync, setOracleInSync] = useState<boolean | null>(null);
  const [zapContractBalance, setZapContractBalance] = useState<bigint>(0n);
  const [ensPriceFromOracle, setEnsPriceFromOracle] = useState<bigint>(0n);

  const { tokens, isEthBalanceFetching } = useAllCoins();

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient({
    chainId,
  });

  // Get ETH balance from tokens
  const ethBalance = useMemo(() => {
    const ethToken = tokens.find((t) => t.id === null);
    return ethToken?.balance || 0n;
  }, [tokens]);

  // Fetch ENS pool reserves from Cookbook
  const { data: reserves } = useReserves({
    poolId: ENS_POOL_ID,
    source: "COOKBOOK",
  });

  // Reset UI state when component mounts
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
    setSellAmt("");
  }, []);

  // Check oracle sync status
  useEffect(() => {
    const checkOracleSync = async () => {
      if (!publicClient) return;

      try {
        // Fetch ETH balance of the zap contract
        const balance = await publicClient.getBalance({
          address: ENSZapAddress
        });
        setZapContractBalance(balance);

        // Fetch ENS price from CheckTheChain oracle
        const ensPriceData = await publicClient.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPriceInETH",
          args: ["ENS"],
        });

        if (ensPriceData) {
          const priceInWei = ensPriceData[0] as bigint;
          setEnsPriceFromOracle(priceInWei);

          // Check if they're within 6% tolerance
          // The zap contract uses its balance as the price oracle
          // We need to check if: |balance - priceInWei| / priceInWei <= 0.06
          if (priceInWei > 0n && balance > 0n) {
            const diff = balance > priceInWei ? balance - priceInWei : priceInWei - balance;
            const percentDiff = (diff * 10000n) / priceInWei;
            setOracleInSync(percentDiff <= 600n); // 6% = 600 basis points
          } else {
            setOracleInSync(null);
          }
        }
      } catch (err) {
        console.error("Failed to check oracle sync:", err);
        setOracleInSync(null);
      }
    };

    checkOracleSync();
    // Check every 30 seconds
    const interval = setInterval(checkOracleSync, 30000);
    return () => clearInterval(interval);
  }, [publicClient]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    setSellAmt(val);

    // Emit event for parent wrapper to listen
    window.dispatchEvent(new CustomEvent("ensZapEthAmountChange", { detail: { amount: val } }));
    if (!reserves || !val || parseFloat(val) === 0) {
      setSingleETHEstimatedCoin("");
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
      return;
    }

    try {
      // The contract will use half of the ETH to swap for tokens on Uniswap V3
      const halfEthAmount = parseEther(val || "0") / 2n;

      // Get ENS price from CheckTheChain (which uses Uniswap V3)
      let estimatedTokens: bigint;
      try {
        const ensPriceData = await publicClient?.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPriceInETH",
          args: ["ENS"],
        });

        if (!ensPriceData) {
          throw new Error(t("errors.unable_to_fetch_ens_price"));
        }

        // Price is returned as uint256 with 18 decimals
        // e.g., 3500000000000000 = 0.0035 ETH per ENS
        const ensPriceInETH = ensPriceData[0] as bigint;

        if (ensPriceInETH === 0n) {
          throw new Error(t("errors.unable_to_fetch_ens_price"));
        }

        // Calculate ENS amount: ETH amount / ENS price
        estimatedTokens = (halfEthAmount * 10n ** 18n) / ensPriceInETH;

        // Apply 0.3% Uniswap V3 fee
        estimatedTokens = (estimatedTokens * 997n) / 1000n;
      } catch (err) {
        console.error("Failed to fetch ENS price from CheckTheChain:", err);
        // Fallback to Cookbook pool price if reserves available
        if (reserves && reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
          estimatedTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, 30n);
        } else {
          estimatedTokens = 0n;
        }
      }

      // Update the estimated coin display
      if (estimatedTokens === 0n) {
        setSingleETHEstimatedCoin("");
      } else {
        const formattedTokens = formatUnits(estimatedTokens, 18);
        setSingleETHEstimatedCoin(formattedTokens);

        // Calculate LP tokens that will be minted
        if (halfEthAmount > 0n && estimatedTokens > 0n) {
          try {
            // Fetch pool info for LP calculation
            const poolInfoResult = await publicClient?.readContract({
              address: CookbookAddress,
              abi: CookbookAbi,
              functionName: "pools",
              args: [ENS_POOL_ID],
            });

            if (poolInfoResult) {
              const poolData = poolInfoResult as unknown as readonly bigint[];
              const totalSupply = poolData[6] as bigint; // Total LP supply at index 6

              if (totalSupply > 0n && reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
                // From AMM: liquidity = min(mulDiv(amount0, supply, reserve0), mulDiv(amount1, supply, reserve1))
                const lpFromEth = (halfEthAmount * totalSupply) / reserves.reserve0;
                const lpFromToken = (estimatedTokens * totalSupply) / reserves.reserve1;
                const lpTokensToMint = lpFromEth < lpFromToken ? lpFromEth : lpFromToken;

                setEstimatedLpTokens(formatUnits(lpTokensToMint, 18));

                // Calculate pool share percentage
                const newTotalSupply = totalSupply + lpTokensToMint;
                const poolShareBps = (lpTokensToMint * 10000n) / newTotalSupply;
                setEstimatedPoolShare(`${(Number(poolShareBps) / 100).toFixed(2)}%`);
              } else if (totalSupply === 0n) {
                // First liquidity provider
                const MINIMUM_LIQUIDITY = 1000n;
                const lpTokens = sqrt(halfEthAmount * estimatedTokens) - MINIMUM_LIQUIDITY;
                setEstimatedLpTokens(formatUnits(lpTokens, 18));
                setEstimatedPoolShare("100%");
              }
            }
          } catch (err) {
            console.error("Error calculating LP tokens:", err);
            setEstimatedLpTokens("");
            setEstimatedPoolShare("");
          }
        }
      }
    } catch (err) {
      console.error("Error estimating ENS Uniswap V3 ZAP amount:", err);
      setSingleETHEstimatedCoin("");
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
    }
  };

  // Execute ENS Uniswap V3 Zap
  const executeENSZap = async () => {
    // Validate inputs
    if (!address || !publicClient) {
      setTxError(t("errors.missing_required_data"));
      return;
    }

    if (!sellAmt || Number.parseFloat(sellAmt) <= 0) {
      setTxError(t("errors.enter_valid_eth_amount"));
      return;
    }

    // Validate sufficient ETH balance
    const requiredEth = parseEther(sellAmt);
    if (ethBalance < requiredEth) {
      setTxError(t("errors.insufficient_eth_balance"));
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError(t("errors.connect_to_mainnet"));
        return;
      }

      const ethAmount = parseEther(sellAmt);

      // The contract will use half of the ETH to swap for tokens on Uniswap V3
      const halfEthAmount = ethAmount / 2n;

      // Get ENS price from CheckTheChain for slippage calculation
      let estimatedTokens: bigint;
      try {
        const ensPriceData = await publicClient?.readContract({
          address: CheckTheChainAddress,
          abi: CheckTheChainAbi,
          functionName: "checkPriceInETH",
          args: ["ENS"],
        });

        if (!ensPriceData) {
          throw new Error(t("errors.unable_to_fetch_ens_price"));
        }

        const ensPriceInETH = ensPriceData[0] as bigint;

        if (ensPriceInETH === 0n) {
          throw new Error(t("errors.unable_to_fetch_ens_price"));
        }

        // Calculate ENS amount: ETH amount / ENS price
        estimatedTokens = (halfEthAmount * 10n ** 18n) / ensPriceInETH;
        estimatedTokens = (estimatedTokens * 997n) / 1000n; // Apply 0.3% fee
      } catch (err) {
        console.error("Failed to fetch ENS price from CheckTheChain:", err);
        // Fallback to Cookbook pool price if reserves available
        if (reserves && reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
          estimatedTokens = getAmountOut(halfEthAmount, reserves.reserve0, reserves.reserve1, 30n);
        } else {
          estimatedTokens = 0n;
        }
      }

      // Simply send ETH directly to the ENS Zap contract
      // The contract will handle the zap internally via its receive/fallback function
      
      // First, estimate gas for the transaction
      let gasEstimate = 300000n; // Default fallback
      try {
        gasEstimate = await publicClient?.estimateGas({
          account: address,
          to: ENSZapAddress,
          value: ethAmount,
        }) || 300000n;
      } catch (e) {
        console.warn("Gas estimation failed, using default", e);
      }
      
      // Add 20% buffer to the estimate for safety
      // This ensures complex operations (swap + add liquidity) have enough gas
      // Unused gas is automatically refunded
      const gasLimit = (gasEstimate * 120n) / 100n;
      
      const hash = await sendTransactionAsync({
        to: ENSZapAddress,
        value: ethAmount, // Send the full ETH amount
        gas: gasLimit, // Use estimated gas + 50% buffer
      });

      setTxHash(hash);
    } catch (err: unknown) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("ENS Uniswap V3 zap execution error:", err);
        setTxError(errorMsg);
      }
    }
  };

  return (
    <div>
      {/* SELL ETH container */}
      <div className="relative flex flex-col">
        <SwapPanel
          title={t("common.provide_eth")}
          selectedToken={{
            ...ETH_TOKEN,
            balance: ethBalance,
            id: null,
            decimals: 18,
          }}
          tokens={[
            {
              ...ETH_TOKEN,
              balance: ethBalance,
              id: null,
              decimals: 18,
            },
          ]}
          onSelect={() => {}}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={!!(ethBalance && ethBalance > 0n)}
          onMax={() => {
            // leave a bit for gas
            const ethAmount = (ethBalance * 99n) / 100n;
            syncFromSell(formatEther(ethAmount));
          }}
          className="rounded-t-2xl pb-4"
        />

        {/* ENS preview panel */}
        <SwapPanel
          title={`${t("common.target_token", { token: "ENS" })} (via Uniswap V3)`}
          selectedToken={ENS_TOKEN}
          tokens={[]}
          onSelect={() => {}}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={singleETHEstimatedCoin || "0"}
          onAmountChange={() => {}}
          readOnly={true}
          previewLabel={t("common.estimated")}
          className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,128,188,0.2)]"
        />
      </div>

      <NetworkError message={t("pool.manage_liquidity")} />

      {/* Slippage */}
      <SlippageSettings setSlippageBps={setSingleEthSlippageBps} slippageBps={singleEthSlippageBps} />

      {/* LP Tokens and Pool Share Estimation */}
      {estimatedLpTokens && estimatedPoolShare && (
        <div className="mt-2 p-3 bg-[#0080BC]/5 border border-[#0080BC]/20 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-muted-foreground">{t("common.estimated_lp_tokens")}:</span>
            <span className="font-mono text-sm flex items-center gap-1">
              {formatNumber(parseFloat(estimatedLpTokens), 6)}
              <ENSLogo className="h-3 w-3 text-[#0080BC]" />
              {t("common.lp")}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("cult.pool_share")}:</span>
            <span className="font-mono text-sm">{estimatedPoolShare}</span>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="text-xs bg-[#0080BC]/5 border border-[#0080BC]/30 rounded p-2 mt-2 text-muted-foreground">
        <div className="flex items-start justify-between mb-1">
          <p className="font-medium">{t("pool.single_sided_eth_liquidity")} (Uniswap V3 Route)</p>
          <a
            href={`https://etherscan.io/address/${ENSZapAddress}#code`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 text-[#0080BC] hover:text-[#0066CC] transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.provide_only_eth")}</li>
          <li className="text-[#0080BC]">{t("ens.half_eth_swapped_v3")}</li>
          <li>{t("ens.remaining_eth_added_to_cookbook_pool")}</li>
          <li>{t("pool.earn_fees_from_trades", { fee: 0.3 })}</li>
          <li className="text-[#0080BC]">{t("ens.default_slippage_10")}</li>
          <li className="flex items-center gap-1">
            <span title={t("ens.oracle_sync_tooltip")}>{t("ens.oracle_sync_status")}:</span>
            {oracleInSync === null ? (
              <span className="text-muted-foreground">{t("common.loading")}</span>
            ) : oracleInSync ? (
              <>
                <CheckIcon className="h-3 w-3 text-green-500" />
                <span className="text-green-500">{t("ens.oracle_in_sync")}</span>
              </>
            ) : (
              <>
                <X className="h-3 w-3 text-red-500" />
                <span className="text-red-500">{t("ens.oracle_out_of_sync")}</span>
                {zapContractBalance > 0n && ensPriceFromOracle > 0n && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    ({formatEther(zapContractBalance).slice(0, 8)} vs {formatEther(ensPriceFromOracle).slice(0, 8)} ETH)
                  </span>
                )}
              </>
            )}
          </li>
        </ul>
      </div>

      {/* ACTION BUTTON */}
      <button
        onClick={executeENSZap}
        disabled={
          !isConnected ||
          isPending ||
          !sellAmt ||
          parseFloat(sellAmt) === 0 ||
          (ethBalance > 0n && parseEther(sellAmt || "0") > ethBalance)
        }
        className={`mt-2 w-full button text-base px-8 py-4 bg-[#0080BC] text-white font-bold rounded-lg transform transition-all duration-200
          ${
            !isConnected ||
            isPending ||
            !sellAmt ||
            parseFloat(sellAmt) === 0 ||
            (ethBalance > 0n && parseEther(sellAmt || "0") > ethBalance)
              ? "opacity-50 cursor-not-allowed"
              : "opacity-100 hover:bg-[#0066CC] hover:shadow-lg focus:ring-4 focus:ring-[#0080BC]/50 focus:outline-none"
          }
        `}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.adding_liquidity")}
          </span>
        ) : (
          t("pool.add")
        )}
      </button>

      {/* Status & errors */}
      {txError && txError.includes(t("common.waiting_for")) && (
        <div className="text-sm text-[#0080BC] mt-2 flex items-center bg-background/50 p-2 rounded border border-[#0080BC]/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
          {txError}
        </div>
      )}
      {txError && !txError.includes(t("common.waiting_for")) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {txError}
        </div>
      )}
      {txHash && !isSuccess && (
        <div className="text-sm text-[#0080BC] mt-2 bg-background/50 p-2 rounded border border-[#0080BC]/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("common.status_confirming")}...
            </span>
            <a
              href={`https://etherscan.io/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#0080BC] hover:text-[#0066CC] transition-colors"
            >
              <span className="font-mono text-xs">
                {txHash.slice(0, 6)}...{txHash.slice(-4)}
              </span>
              <span className="text-xs">↗</span>
            </a>
          </div>
        </div>
      )}
      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 bg-background/50 p-2 rounded border border-chart-2/20">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckIcon className="h-3 w-3" />
              {t("common.status_success")}!
            </span>
            {txHash && (
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-chart-2 hover:text-chart-2/80 transition-colors"
              >
                <span className="font-mono text-xs">
                  {txHash.slice(0, 6)}...{txHash.slice(-4)}
                </span>
                <span className="text-xs">↗</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
