import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  usePublicClient,
  useChainId,
  useSendTransaction,
  useConnectorClient,
} from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES, ZORG_SHARES_ABI } from "@/constants/ZORG";
import { ZRouterAddress, ZRouterAbi } from "@/constants/ZRouter";
import { toast } from "sonner";
import { encodeFunctionData, parseUnits, formatUnits, formatEther, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { useZRouterQuote } from "@/hooks/use-zrouter-quote";
import { TradePanel } from "@/components/trade/TradePanel";
import { ZorgNFTBanner } from "./ZorgNFTBanner";
import { ETH_TOKEN, ZAMM_TOKEN, ZAMM_ERC20_TOKEN, type TokenMetadata } from "@/lib/pools";
import { buildRoutePlan, checkRouteApprovals, erc20Abi, zRouterAbi } from "zrouter-sdk";
import { CoinsAbi } from "@/constants/Coins";
import { Loader2, ArrowRight, Coins } from "lucide-react";
import { handleWalletError } from "@/lib/errors";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";

export const JoinDAO = () => {
  const { t } = useTranslation();
  const { address: owner, isConnected, connector } = useAccount();
  const { data: allTokens = [], isLoading: isTokensLoading } = useGetTokens(owner);
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const { data: connectorClient, isLoading: isConnectorLoading } = useConnectorClient();
  const isWalletReady = isConnected && !!connectorClient && !!connector;

  const filteredTokens = allTokens.filter(
    (token) =>
      (token.address === ETH_TOKEN.address && token.id === ETH_TOKEN.id) ||
      (token.address === ZAMM_TOKEN.address && token.id === ZAMM_TOKEN.id),
  );

  const hasBalances = filteredTokens.length > 0 && filteredTokens.every((token) => token.balance !== undefined);
  const tokens = hasBalances ? filteredTokens : [];

  const [inputToken, setInputToken] = useState<TokenMetadata>(ETH_TOKEN);
  const [inputAmount, setInputAmount] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [hasInitializedToken, setHasInitializedToken] = useState(false);

  useEffect(() => {
    if (hasBalances && tokens.length > 0 && !hasInitializedToken) {
      const ethTokenWithBalance = tokens.find(
        (token) => token.address === ETH_TOKEN.address && token.id === ETH_TOKEN.id,
      );
      if (ethTokenWithBalance) {
        setInputToken(ethTokenWithBalance);
        setHasInitializedToken(true);
      }
    }
  }, [hasBalances, tokens, hasInitializedToken]);

  const { sendTransactionAsync, isPending } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const [debouncedAmount, setDebouncedAmount] = useState(inputAmount);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(inputAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount]);

  const { data: zorgSharesBalance, isLoading: isSharesBalanceLoading } = useReadContract({
    address: ZORG_SHARES,
    abi: ZORG_SHARES_ABI,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: {
      enabled: !!owner,
      staleTime: 30_000,
    },
  });

  const { data: zammSaleConfig, isLoading: isSaleConfigLoading } = useReadContract({
    address: ZORG_ADDRESS,
    abi: ZORG_ABI,
    functionName: "sales",
    args: [ZAMM_ERC20_TOKEN],
    query: {
      staleTime: 10_000,
    },
  });

  const saleConfig = zammSaleConfig;
  const payToken = ZAMM_ERC20_TOKEN;
  const payTokenSymbol = "ZAMM";

  const targetToken: TokenMetadata = ZAMM_TOKEN;

  const { data: quote, isFetching: isQuoteFetching } = useZRouterQuote({
    publicClient: publicClient ?? undefined,
    sellToken: inputToken,
    buyToken: targetToken,
    rawAmount: debouncedAmount,
    side: "EXACT_IN",
    enabled: !!publicClient && !!debouncedAmount && Number(debouncedAmount) > 0,
    owner,
  });

  const handleJoinDAO = async () => {
    setIsExecuting(true);
    setTxError(null);

    try {
      if (!isConnected || !owner) {
        setTxError("Connect your wallet to proceed");
        setIsExecuting(false);
        return;
      }
      if (!isWalletReady || isConnectorLoading) {
        setTxError("Wallet is still connecting. Please wait a moment and try again.");
        setIsExecuting(false);
        return;
      }
      if (!publicClient) {
        setTxError("Client not ready");
        setIsExecuting(false);
        return;
      }
      if (chainId !== mainnet.id) {
        setTxError("Wrong network: switch to Ethereum Mainnet");
        setIsExecuting(false);
        return;
      }
      if (!inputAmount || Number(inputAmount) <= 0) {
        setTxError("Enter an amount");
        setIsExecuting(false);
        return;
      }
      if (!quote?.ok || !quote.routes?.[0]) {
        setTxError("No route found. Try again.");
        setIsExecuting(false);
        return;
      }
      if (!saleConfig || !saleConfig[3]) {
        setTxError("DAO sale not active");
        setIsExecuting(false);
        return;
      }

      const selectedRoute = quote.routes[0];
      const steps = selectedRoute.route.steps;

      if (!steps.length) {
        setTxError("Invalid route");
        setIsExecuting(false);
        return;
      }

      const requiredApprovals = await checkRouteApprovals(publicClient, {
        owner,
        router: ZRouterAddress,
        steps,
      }).catch((error) => {
        console.error("Failed to check approvals:", error);
        return [];
      });

      if (requiredApprovals && requiredApprovals.length > 0) {
        for (const approval of requiredApprovals) {
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
            account: owner,
          });
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      const swapPlan = await buildRoutePlan(publicClient, {
        owner,
        router: ZRouterAddress,
        steps,
        finalTo: ZRouterAddress,
      }).catch(() => undefined);

      if (!swapPlan) {
        setTxError("Failed to build swap plan");
        setIsExecuting(false);
        return;
      }

      const paymentOutput = parseUnits(selectedRoute.amountOut, targetToken.decimals ?? 18);
      const maxPay = (paymentOutput * 11n) / 10n;

      const buySharesData = encodeFunctionData({
        abi: ZORG_ABI,
        functionName: "buyShares",
        args: [payToken, paymentOutput, maxPay],
      });

      const executeCall = encodeFunctionData({
        abi: ZRouterAbi,
        functionName: "execute",
        args: [ZORG_ADDRESS, 0n, buySharesData],
      });

      const sweepCall = encodeFunctionData({
        abi: ZRouterAbi,
        functionName: "sweep",
        args: [ZORG_SHARES, 0n, 0n, owner],
      });

      const swapCalls = swapPlan.calls.slice(0, -1);
      const swapSweepCall = swapPlan.calls[swapPlan.calls.length - 1];

      const allCalls = [...swapCalls, executeCall, sweepCall, swapSweepCall];

      const hash = await sendTransactionAsync({
        to: ZRouterAddress,
        data: encodeFunctionData({
          abi: zRouterAbi,
          functionName: "multicall",
          args: [allCalls],
        }),
        value: swapPlan.value,
        chainId: mainnet.id,
        account: owner,
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status !== "success") {
        throw new Error("Transaction failed");
      }

      setTxHash(hash);
      toast.success("Successfully joined the DAO!");
      setInputAmount("");
      setIsExecuting(false);
    } catch (err) {
      console.error("Join DAO error:", err);
      const msg = handleWalletError(err);
      if (msg !== null) {
        setTxError(msg);
        toast.error(msg);
      }
      setIsExecuting(false);
    }
  };

  const isActive = saleConfig && saleConfig[3];
  const pricePerShare = saleConfig ? saleConfig[0] : 0n;
  const cap = saleConfig ? saleConfig[1] : 0n;

  const estimatedShares = quote?.ok && quote.amountOut ? quote.amountOut : "0";
  const isLoading = isExecuting || isPending;

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <div className="p-4 sm:p-6">
          {/* NFT Banner */}
          <ZorgNFTBanner />

          {/* Current Shares Balance */}
          {owner && (
            <div className="mb-4 p-3 rounded-lg border border-primary/20 bg-primary/5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Your ZORG Shares</span>
                <span className="font-mono font-semibold text-primary">
                  {isSharesBalanceLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  ) : (
                    formatEther(zorgSharesBalance ?? 0n)
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isSaleConfigLoading && (
            <div className="mb-4 p-4 border rounded-lg flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading sale data...</span>
            </div>
          )}

          {/* Sale Not Active */}
          {!isSaleConfigLoading && !isActive && (
            <div className="mb-4 p-4 border border-orange-500/30 rounded-lg bg-orange-500/5">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                <span className="text-sm font-medium text-orange-500">{t("dao.sale_not_active")}</span>
              </div>
            </div>
          )}

          {/* Main Action Panel */}
          {!isSaleConfigLoading && isActive && (
            <div className="space-y-4">
              {/* Sale Info */}
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-muted-foreground">{t("dao.price_per_share")}</span>
                  <span className="font-mono text-sm font-medium">
                    {pricePerShare.toString()} {payTokenSymbol}
                  </span>
                </div>
                {cap > 0n && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{t("dao.remaining_shares")}</span>
                    <span className="font-mono text-sm font-medium">{formatEther(cap)}</span>
                  </div>
                )}
              </div>

              {/* Token Input */}
              {isTokensLoading || !hasBalances ? (
                <div>
                  <label className="block mb-2 text-xs text-muted-foreground uppercase tracking-wide">Pay With</label>
                  <div className="flex items-center justify-center gap-2 py-8 border rounded-lg">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Loading token balances...</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block mb-2 text-xs text-muted-foreground uppercase tracking-wide">Pay With</label>
                  <TradePanel
                    className="rounded-lg"
                    title="Sell"
                    selectedToken={inputToken}
                    tokens={tokens}
                    onSelect={setInputToken}
                    amount={inputAmount}
                    onAmountChange={(val) => {
                      setInputAmount(val);
                      setTxError(null);
                    }}
                    showMaxButton={!!(inputToken?.balance && BigInt(inputToken.balance) > 0n)}
                    onMax={() => {
                      if (!inputToken?.balance) return;
                      const decimals = inputToken.decimals ?? 18;
                      setInputAmount(formatUnits(inputToken.balance as bigint, decimals));
                      setTxError(null);
                    }}
                    showPercentageSlider={!!(inputToken?.balance && BigInt(inputToken.balance) > 0n)}
                    locked={false}
                  />
                </div>
              )}

              {/* Quote Loading */}
              {isQuoteFetching && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span className="text-xs text-primary">Finding best route...</span>
                </div>
              )}

              {/* Estimated Output */}
              {quote?.ok && !isQuoteFetching && inputAmount && Number(inputAmount) > 0 && (
                <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span className="text-xs text-muted-foreground uppercase">You will receive</span>
                    <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                      ~{estimatedShares} ZORG Shares
                    </span>
                  </div>
                </div>
              )}

              {/* CTA Button */}
              <Button
                onClick={!owner ? openConnectModal : handleJoinDAO}
                disabled={
                  owner &&
                  (isLoading ||
                    isConnectorLoading ||
                    !isWalletReady ||
                    !inputAmount ||
                    Number(inputAmount) <= 0 ||
                    !quote?.ok)
                }
                className="w-full"
                size="lg"
              >
                {!owner ? (
                  "Connect Wallet"
                ) : isConnectorLoading ? (
                  "Connecting..."
                ) : isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Coins className="h-4 w-4 mr-2" />
                    Join DAO
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>

              {/* Error Message */}
              {txError && (
                <div className="p-3 border border-red-500/30 rounded-lg bg-red-500/5">
                  <span className="text-sm text-red-500">{txError}</span>
                </div>
              )}

              {/* Success Message */}
              {isSuccess && (
                <div className="p-3 border border-green-500/30 rounded-lg bg-green-500/5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                    <span className="text-sm text-green-600 dark:text-green-400">
                      Successfully joined the DAO! TX: {txHash?.slice(0, 10)}...
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer Note */}
          <p className="mt-4 text-center text-xs text-muted-foreground">{t("dao.buy_shares_note")}</p>
        </div>
      )}
    </ConnectButton.Custom>
  );
};
