import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { encodeFunctionData, formatEther, formatUnits, maxUint256, parseUnits, type Address } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useChainId, usePublicClient, useSendTransaction, useWaitForTransactionReceipt } from "wagmi";
import { PoolSwapChart } from "@/PoolSwapChart";
import { FlipActionButton } from "@/components/FlipActionButton";
import { NetworkError } from "@/components/NetworkError";
import { SlippageSettings } from "@/components/SlippageSettings";
import { SwapPanel } from "@/components/SwapPanel";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CoinsAbi } from "@/constants/Coins";
import { useTokenSelection } from "@/contexts/TokenSelectionContext";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { useReserves } from "@/hooks/use-reserves";
import { useENSResolution } from "@/hooks/use-ens-resolution";
import { useETHPrice } from "@/hooks/use-eth-price";
import type { TokenMeta } from "@/lib/coins";
import { handleWalletError } from "@/lib/errors";
import { SLIPPAGE_BPS, SWAP_FEE, analyzeTokens, getPoolIds, getSwapFee } from "@/lib/swap";
import { cn, formatNumber } from "@/lib/utils";
import { SwapController } from "@/components/SwapController";
import { buildRoutePlan, mainnetConfig, findRoute, simulateRoute, erc20Abi, zRouterAbi } from "zrouter-sdk";
import { CustomRecipientInput } from "@/CustomRecipientInput";
import { formatDexscreenerStyle } from "@/lib/math";
import { SwapEfficiencyNote } from "@/components/SwapEfficiencyNote";
import { useZRouterQuote } from "@/hooks/use-zrouter-quote";
import { toZRouterToken } from "@/lib/zrouter";
import { SwapError } from "./SwapError";

interface Props {
  lockedTokens?: {
    sellToken: TokenMeta;
    buyToken: TokenMeta;
  };
}

const DEBUG_IMPACT = true;

export const InstantSwapAction = ({ lockedTokens }: Props) => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { tokens, isEthBalanceFetching } = useAllCoins();
  const { data: ethPrice } = useETHPrice();

  // amounts + recipient
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [customRecipient, setCustomRecipient] = useState<string>("");

  // selection (context unless locked)
  const tokenSelectionContext = useTokenSelection();
  const {
    sellToken: contextSellToken,
    buyToken: contextBuyToken,
    setSellToken: contextSetSellToken,
    setBuyToken: contextSetBuyToken,
    flipTokens: contextFlipTokens,
  } = tokenSelectionContext;

  const sellToken = lockedTokens?.sellToken || contextSellToken;
  const buyToken = lockedTokens?.buyToken || contextBuyToken;
  const setSellToken = lockedTokens ? () => {} : contextSetSellToken;
  const setBuyToken = lockedTokens ? () => {} : contextSetBuyToken;
  const flipTokens = lockedTokens ? () => {} : contextFlipTokens;

  const [lastEditedField, setLastEditedField] = useState<"sell" | "buy">("sell");
  const ensResolution = useENSResolution(customRecipient);

  const isExternalSwap = useMemo(
    () => sellToken?.source === "ERC20" || buyToken?.source === "ERC20",
    [sellToken, buyToken],
  );

  const {
    isCustom: isCustomPool,
    isCoinToCoin,
    coinId,
    isDirectUsdtEth: isDirectUsdtEthSwap,
    canSwap,
  } = useMemo(() => analyzeTokens(sellToken, buyToken), [sellToken, buyToken]);

  const { mainPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool,
    isCoinToCoin,
  });

  // const isENSPool = sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS";
  // const ensPoolId = isENSPool
  //   ? 107895081322979037665933919470752294545033231002190305779392467929211865476585n
  //   : undefined;

  const { data: reserves } = useReserves({
    poolId: mainPoolId,
    source: sellToken?.id === null ? buyToken?.source : sellToken.source,
  });

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const { sendTransactionAsync, isPending, error: writeError } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const prevPairRef = useRef<string | null>(null);
  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // resets on token changes
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
    setSellAmt("");
    setBuyAmt("");
    setCustomRecipient("");
    if (sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS") setSlippageBps(1000n);
    else setSlippageBps(SLIPPAGE_BPS);
  }, [sellToken.id, buyToken?.id, sellToken?.symbol, buyToken?.symbol]);

  useEffect(() => {
    if (tokens.length && sellToken.id === null) {
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  useEffect(() => {
    if (!buyToken && tokens.length > 1) setBuyToken(tokens[1]);
  }, [tokens, buyToken]);

  /** ------------------------------
   * Quotes via useZRouterQuote
   * ------------------------------ */
  const side = lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";
  const rawAmount = lastEditedField === "sell" ? sellAmt : buyAmt;
  const quotingEnabled = !!publicClient && !!sellToken && !!buyToken && !!rawAmount && Number(rawAmount) > 0;

  const { data: quoteBase } = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken,
    buyToken,
    rawAmount,
    side,
    enabled: quotingEnabled,
  });

  const epsilon = 0.01;
  const bumpedRawAmount = quotingEnabled && Number(rawAmount) > 0 ? String(Number(rawAmount) * (1 + epsilon)) : "";

  const { data: quoteBumped } = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken,
    buyToken,
    rawAmount: bumpedRawAmount,
    side,
    enabled: quotingEnabled && !!bumpedRawAmount,
  });

  // reflect quote
  useEffect(() => {
    if (!quotingEnabled || !quoteBase?.ok) return;
    if (lastEditedField === "sell") {
      if (buyAmt !== quoteBase.amountOut) setBuyAmt(quoteBase.amountOut ?? "");
    } else {
      if (sellAmt !== quoteBase.amountIn) setSellAmt(quoteBase.amountIn ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteBase, quotingEnabled, lastEditedField]);

  // price impact estimation
  useEffect(() => {
    try {
      if (!sellToken || !buyToken || !quotingEnabled || !quoteBase?.ok || !quoteBumped?.ok) {
        setPriceImpact(null);
        return;
      }
      if (side === "EXACT_IN") {
        const in0 = Number(rawAmount);
        const out0 = Number(quoteBase.amountOut);
        const in1 = Number(bumpedRawAmount);
        const out1 = Number(quoteBumped.amountOut);
        if (!isFinite(in0) || !isFinite(out0) || !isFinite(in1) || !isFinite(out1) || out0 <= 0 || out1 <= 0) {
          setPriceImpact(null);
          return;
        }
        const p0 = in0 / out0;
        const p1 = in1 / out1;
        const impactPercent = (p1 / p0 - 1) * 100;
        if (DEBUG_IMPACT) console.debug("[impact] EXACT_IN", { p0, p1, impactPercent });
        setPriceImpact({
          currentPrice: p0,
          projectedPrice: p1,
          impactPercent,
          action: "buy",
        });
      } else {
        const out0 = Number(rawAmount);
        const in0 = Number(quoteBase.amountIn);
        const out1 = Number(bumpedRawAmount);
        const in1 = Number(quoteBumped.amountIn);
        if (!isFinite(in0) || !isFinite(out0) || !isFinite(in1) || !isFinite(out1) || out0 <= 0 || out1 <= 0) {
          setPriceImpact(null);
          return;
        }
        const p0 = in0 / out0;
        const p1 = in1 / out1;
        const impactPercent = (p1 / p0 - 1) * 100;
        if (DEBUG_IMPACT) console.debug("[impact] EXACT_OUT", { p0, p1, impactPercent });
        setPriceImpact({
          currentPrice: p0,
          projectedPrice: p1,
          impactPercent,
          action: "buy",
        });
      }
    } catch {
      setPriceImpact(null);
    }
  }, [quoteBase, quoteBumped, side, rawAmount, bumpedRawAmount, sellToken?.id, buyToken?.id]);

  // input handlers
  const syncFromBuy = (val: string) => {
    setBuyAmt(val);
    setLastEditedField("buy");
  };
  const syncFromSell = (val: string) => {
    setSellAmt(val);
    setLastEditedField("sell");
  };

  // execute instant swap
  const executeSwap = async () => {
    try {
      if (!isConnected || !address) {
        setTxError(t("errors.wallet_connection"));
        return;
      }
      if (!sellToken || !buyToken || !publicClient) {
        setTxError(t("swap.enter_amount"));
        return;
      }
      if (!sellAmt || (lastEditedField === "buy" && !buyAmt)) {
        setTxError(t("swap.enter_amount"));
        return;
      }
      if (chainId !== mainnet.id) {
        setTxError(t("errors.network_error"));
        return;
      }

      // resolve recipient
      let finalRecipient: Address | undefined;
      if (customRecipient && customRecipient.trim() !== "") {
        if (ensResolution.isLoading) {
          setTxError(t("swap.resolving_ens") || "Resolving ENS name...");
          return;
        }
        if (ensResolution.error) {
          setTxError(ensResolution.error);
          return;
        }
        if (!ensResolution.address) {
          setTxError(t("errors.invalid_address") || "Invalid recipient address");
          return;
        }
        finalRecipient = ensResolution.address as Address;
      }

      setTxError(null);

      const tokenIn = toZRouterToken(sellToken);
      const tokenOut = toZRouterToken(buyToken);
      const side = lastEditedField === "sell" ? "EXACT_IN" : "EXACT_OUT";
      const raw = lastEditedField === "sell" ? sellAmt : buyAmt;
      const decimals = lastEditedField === "sell" ? sellToken.decimals || 18 : buyToken.decimals || 18;
      const amount = parseUnits(raw!, decimals);

      const steps = await findRoute(publicClient, {
        tokenIn,
        tokenOut,
        side,
        amount,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 60 * 10),
        owner: address,
        slippageBps: Number(slippageBps),
      }).catch(() => []);

      if (!steps.length) {
        setTxError(t("errors.unexpected") || "No route found");
        return;
      }

      const plan = await buildRoutePlan(publicClient, {
        owner: address,
        router: mainnetConfig.router,
        steps,
        finalTo: (finalRecipient || (address as Address)) as Address,
      }).catch(() => undefined);

      if (!plan) {
        setTxError("Failed to build route plan");
        return;
      }

      const { calls, value, approvals } = plan;

      // optimistic: approvals (best-effort one-shot approve max)
      if (approvals && approvals.length > 0) {
        for (const approval of approvals) {
          const hash = await sendTransactionAsync({
            to: approval.token.address,
            data:
              approval.kind === "ERC20_APPROVAL"
                ? encodeFunctionData({
                    abi: erc20Abi,
                    functionName: "approve",
                    args: [approval.spender, maxUint256],
                  })
                : encodeFunctionData({
                    abi: CoinsAbi,
                    functionName: "setOperator",
                    args: [approval.operator, approval.approved],
                  }),
            value: 0n,
            chainId: mainnet.id,
            account: address,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      const sim = await simulateRoute(publicClient, {
        router: mainnetConfig.router,
        account: address,
        calls,
        value,
        approvals,
      }).catch(() => undefined);

      if (!sim) {
        setTxError("Failed to simulate route");
        return;
      }

      // send
      let hash: `0x${string}`;
      if (calls.length === 1) {
        hash = await sendTransactionAsync({
          to: mainnetConfig.router,
          data: calls[0],
          value: value,
          chainId: mainnet.id,
          account: address,
        });
      } else {
        hash = await sendTransactionAsync({
          to: mainnetConfig.router,
          data: encodeFunctionData({
            abi: zRouterAbi,
            functionName: "multicall",
            args: [calls],
          }),
          value: value,
          chainId: mainnet.id,
          account: address,
        });
      }
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction failed");
      setTxHash(hash);
    } catch (err: unknown) {
      const msg = handleWalletError(err);
      setTxError(msg || t("errors.unexpected"));
    }
  };

  const handleFlipTokens = () => {
    if (!buyToken) return;
    if (txError) setTxError(null);
    setSellAmt("");
    setBuyAmt("");
    setLastEditedField("sell");
    flipTokens();
    if (address && isConnected) {
      sessionStorage.setItem("lastConnectedAddress", address);
    }
  };

  const handleBuyTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setSellAmt("");
      setBuyAmt("");
      setLastEditedField("buy");
      setBuyToken(token);
    },
    [txError],
  );

  const handleSellTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setSellAmt("");
      setBuyAmt("");
      setLastEditedField("sell");
      setSellToken(token);
    },
    [txError],
  );

  return (
    <div className="relative w-full flex flex-col">
      {/* Optional controller line input */}
      <SwapController
        onAmountChange={(sellAmount) => {
          setSellAmt(sellAmount);
          setLastEditedField("sell");
        }}
        currentSellToken={sellToken}
        currentBuyToken={buyToken ?? undefined}
        currentSellAmount={sellAmt}
      />

      {/* SELL / FLIP / BUY */}
      <div className="relative flex flex-col">
        <SwapPanel
          title={"Sell"}
          selectedToken={sellToken}
          tokens={memoizedTokens}
          onSelect={handleSellTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={sellAmt}
          onAmountChange={syncFromSell}
          showMaxButton={!!(sellToken.balance && (sellToken.balance as bigint) > 0n && lastEditedField === "sell")}
          onMax={() => {
            if (sellToken.id === null) {
              const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
              syncFromSell(formatEther(ethAmount));
            } else {
              const decimals = sellToken.decimals || 18;
              syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
            }
          }}
          showPercentageSlider={
            lastEditedField === "sell" || (isExternalSwap && !!sellToken.balance && (sellToken.balance as bigint) > 0n)
          }
          className="pb-4"
          readOnly={!!lockedTokens}
        />

        {!lockedTokens && (
          <div
            className={cn(
              "absolute left-1/2 -translate-x-1/2 z-10",
              !!(
                sellToken.balance &&
                (sellToken.balance as bigint) > 0n &&
                (lastEditedField === "sell" || isExternalSwap)
              )
                ? "top-[63%]"
                : "top-[50%]",
            )}
          >
            <FlipActionButton onClick={handleFlipTokens} />
          </div>
        )}

        {buyToken && (
          <SwapPanel
            title={"Buy"}
            selectedToken={buyToken}
            tokens={memoizedTokens}
            onSelect={handleBuyTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            amount={buyAmt}
            onAmountChange={syncFromBuy}
            className="pt-4"
            readOnly={!!lockedTokens}
          />
        )}
      </div>

      <SwapEfficiencyNote
        publicClient={publicClient}
        sellToken={sellToken}
        buyToken={buyToken ?? undefined}
        lastEditedField={lastEditedField}
        sellAmt={sellAmt}
        buyAmt={buyAmt}
      />

      <CustomRecipientInput
        customRecipient={customRecipient}
        setCustomRecipient={setCustomRecipient}
        ensResolution={ensResolution}
      />

      <NetworkError message={"Swap"} />

      <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />

      {/* Pool/reserve info (for internal pools) */}
      {canSwap && reserves && !isExternalSwap && (
        <div className="text-xs text-foreground px-1 mt-1">
          <div className="flex justify-between">
            {isCoinToCoin &&
            !isDirectUsdtEthSwap &&
            !(
              (sellToken.id === null && buyToken?.symbol === "USDT") ||
              (buyToken?.id === null && sellToken.symbol === "USDT")
            ) ? (
              <span className="flex items-center">
                <span className="bg-chart-5/20 text-chart-5 px-1 rounded mr-1">Route</span>
                {sellToken.symbol} to ETH to {buyToken?.symbol}
              </span>
            ) : (
              <span>
                Pool: {formatNumber(parseFloat(formatEther(reserves.reserve0)), 5)} ETH /{" "}
                {formatNumber(
                  parseFloat(
                    formatUnits(
                      reserves.reserve1,
                      isCustomPool
                        ? sellToken.isCustomPool
                          ? sellToken.decimals || 18
                          : buyToken?.decimals || 18
                        : 18,
                    ),
                  ),
                  3,
                )}{" "}
                {coinId ? tokens.find((t) => t.id === coinId)?.symbol || "Token" : buyToken?.symbol}
              </span>
            )}
            <span className="flex items-center gap-2">
              <span>
                Fee:{" "}
                {getSwapFee({
                  isCustomPool,
                  sellToken,
                  buyToken,
                  isCoinToCoin,
                })}
              </span>
              {priceImpact && (
                <span
                  className={`text-xs font-medium ${priceImpact.impactPercent > 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {priceImpact.impactPercent > 0 ? "+" : ""}
                  {formatDexscreenerStyle(priceImpact.impactPercent)}%
                </span>
              )}
            </span>
          </div>

          {/** USD stats */}
          {ethPrice?.priceUSD && !isCoinToCoin && (
            <div className="text-muted-foreground mt-1 space-y-0.5">
              {(() => {
                const ethAmount = parseFloat(formatEther(reserves.reserve0));
                const tokenAmount = parseFloat(
                  formatUnits(
                    reserves.reserve1,
                    isCustomPool ? (sellToken.isCustomPool ? sellToken.decimals || 18 : buyToken?.decimals || 18) : 18,
                  ),
                );
                const tokenPriceInEth = ethAmount / tokenAmount;
                const ethPriceInToken = tokenAmount / ethAmount;
                const tokenPriceUsd = tokenPriceInEth * ethPrice.priceUSD;
                const totalPoolValueUsd = ethAmount * ethPrice.priceUSD * 2;
                const tokenSymbol = coinId ? tokens.find((t) => t.id === coinId)?.symbol || "Token" : buyToken?.symbol;
                const poolToken = coinId ? tokens.find((t) => t.id === coinId) : buyToken;
                const actualSwapFee = poolToken?.swapFee ?? SWAP_FEE;

                return (
                  <>
                    <div className="opacity-75 text-xs">
                      Total Pool Value: ${formatNumber(totalPoolValueUsd, 2)} USD
                    </div>
                    <div className="opacity-60 text-xs space-y-0.5">
                      <div>
                        1 ETH = {formatNumber(ethPriceInToken, 6)} {tokenSymbol}
                      </div>
                      <div>
                        1 {tokenSymbol} = {tokenPriceInEth.toFixed(8)} ETH ($
                        {tokenPriceUsd.toFixed(8)} USD)
                      </div>
                      <div className="flex items-center gap-1">
                        <span>Fee: {Number(actualSwapFee) / 100}%</span>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <span className="text-[10px] opacity-70 cursor-help hover:opacity-100 transition-opacity">
                              ⓘ
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-auto">
                            <p className="text-sm">Paid to LPs</p>
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* Action button */}
      <button
        onClick={executeSwap}
        disabled={!isConnected || !sellAmt || isPending || !canSwap}
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transition ${
          !isConnected || !sellAmt || isPending || !canSwap ? "opacity-50 cursor-not-allowed" : "hover:scale-105"
        }`}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <LoadingLogo className="m-0 p-0 h-6 w-6" size="sm" />
            {t("common.loading")}
          </span>
        ) : customRecipient && ensResolution.address ? (
          <span className="flex items-center gap-2">{t("common.swap")} 📤</span>
        ) : (
          t("common.swap")
        )}
      </button>

      {/* Recipient banner */}
      {customRecipient && ensResolution.address && !txError && (
        <div className="text-sm text-chart-2 mt-2 flex items-center bg-chart-2/10 p-2 rounded border border-chart-2/20">
          <span className="text-xs">
            📤 {t("swap.recipient_note") || "Output will be sent to"}: {ensResolution.address.slice(0, 6)}...
            {ensResolution.address.slice(-4)}
          </span>
        </div>
      )}

      {/* Errors */}
      {writeError && <SwapError message={writeError?.message ?? "Unknown write error occured"} />}
      {txError && <SwapError message={txError ?? "Unknown Tx error occured"} />}

      {/* Success */}
      {isSuccess && (
        <div className="text-sm text-chart-2 mt-2 flex items-center justify-between bg-background/50 p-2 rounded border border-chart-2/20">
          <div className="flex items-center">
            <CheckIcon className="h-3 w-3 mr-2" />
            Transaction confirmed!
          </div>
          <Link to="/orders" className="hidden" />
        </div>
      )}

      <div className="mt-4 border-t border-primary pt-4">
        <PoolSwapChart buyToken={buyToken} sellToken={sellToken} prevPair={prevPairRef.current} priceImpact={null} />
      </div>
    </div>
  );
};
