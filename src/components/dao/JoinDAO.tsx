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
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES } from "@/constants/ZORG";
import { ZRouterAddress, ZRouterAbi } from "@/constants/ZRouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { encodeFunctionData, parseUnits, formatUnits, formatEther, maxUint256 } from "viem";
import { mainnet } from "viem/chains";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { useZRouterQuote } from "@/hooks/use-zrouter-quote";
import { TradePanel } from "@/components/trade/TradePanel";
import { ETH_TOKEN, ZAMM_TOKEN, ZAMM_ERC20_TOKEN, type TokenMetadata } from "@/lib/pools";
import { buildRoutePlan, checkRouteApprovals, erc20Abi, zRouterAbi } from "zrouter-sdk";
import { CoinsAbi } from "@/constants/Coins";
import { Loader2 } from "lucide-react";
import { handleWalletError } from "@/lib/errors";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export const JoinDAO = () => {
  const { t } = useTranslation();
  const { address: owner, isConnected, connector } = useAccount();
  const { data: allTokens = [], isLoading: isTokensLoading } = useGetTokens(owner);
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Check if connector client is ready - this prevents the "getChainId is not a function" error
  const { data: connectorClient, isLoading: isConnectorLoading } = useConnectorClient();
  const isWalletReady = isConnected && !!connectorClient && !!connector;

  // Filter tokens to only show ETH and ZAMM with balances
  const filteredTokens = allTokens.filter(
    (token) =>
      (token.address === ETH_TOKEN.address && token.id === ETH_TOKEN.id) ||
      (token.address === ZAMM_TOKEN.address && token.id === ZAMM_TOKEN.id),
  );

  // Check if balances are loaded (tokens have balance property defined)
  const hasBalances = filteredTokens.length > 0 && filteredTokens.every((token) => token.balance !== undefined);

  // Only use tokens when balances are loaded
  const tokens = hasBalances ? filteredTokens : [];

  const [inputToken, setInputToken] = useState<TokenMetadata>(ETH_TOKEN);
  const [inputAmount, setInputAmount] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [hasInitializedToken, setHasInitializedToken] = useState(false);

  // Update the selected token with balance when tokens are first loaded
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

  // Debounce input amount
  const [debouncedAmount, setDebouncedAmount] = useState(inputAmount);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(inputAmount);
    }, 500);
    return () => clearTimeout(timer);
  }, [inputAmount]);

  // Fetch sale config for ZAMM token
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

  // Get quote from input token to the payment token (ZAMM or ETH)
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
        // active flag
        setTxError("DAO sale not active");
        setIsExecuting(false);
        return;
      }

      // Get the best route
      const selectedRoute = quote.routes[0];
      const steps = selectedRoute.route.steps;

      if (!steps.length) {
        setTxError("Invalid route");
        setIsExecuting(false);
        return;
      }

      console.log("Checking route approvals...");

      // Check approvals for the swap
      const requiredApprovals = await checkRouteApprovals(publicClient, {
        owner,
        router: ZRouterAddress,
        steps,
      }).catch((error) => {
        console.error("Failed to check approvals:", error);
        return [];
      });

      console.log("Required approvals:", requiredApprovals);

      // Execute all required approvals
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
          // Wait for approval to be confirmed
          await publicClient.waitForTransactionReceipt({ hash });
        }
      }

      console.log("Building route plan for swap to ZAMM...");

      // Build route plan with destination = zRouter (so ZAMM stays in zRouter)
      const swapPlan = await buildRoutePlan(publicClient, {
        owner,
        router: ZRouterAddress,
        steps,
        finalTo: ZRouterAddress, // CRITICAL: Keep ZAMM in zRouter for the execute() call
      }).catch(() => undefined);

      if (!swapPlan) {
        setTxError("Failed to build swap plan");
        setIsExecuting(false);
        return;
      }

      console.log("Built swap plan:", swapPlan);

      // Calculate payment token output amount (from quote)
      const paymentOutput = parseUnits(selectedRoute.amountOut, targetToken.decimals ?? 18);

      // Calculate max payment for buyShares (with 10% slippage)
      const maxPay = (paymentOutput * 11n) / 10n;

      // Encode buyShares call
      const buySharesData = encodeFunctionData({
        abi: ZORG_ABI,
        functionName: "buyShares",
        args: [payToken, paymentOutput, maxPay],
      });

      // Encode execute call (calls buyShares on ZORG DAO using ZAMM in zRouter)
      const executeCall = encodeFunctionData({
        abi: ZRouterAbi,
        functionName: "execute",
        args: [ZORG_ADDRESS, 0n, buySharesData],
      });

      // Encode sweep call (sweep zOrg shares to user)
      // Note: amount=0 means sweep all balance
      const sweepCall = encodeFunctionData({
        abi: ZRouterAbi,
        functionName: "sweep",
        args: [ZORG_SHARES, 0n, 0n, owner],
      });

      // Split swap plan: all calls except the last one, and the last call separately
      const swapCalls = swapPlan.calls.slice(0, -1); // all calls except the last one
      const swapSweepCall = swapPlan.calls[swapPlan.calls.length - 1]; // only the last call

      console.log("Swap Plan:", swapPlan.calls.length, "calls total");
      console.log("Swap calls:", swapCalls.length, "Execute + sweep: 2", "Final sweep: 1");

      // Combine all calls: swap steps + execute + sweep + final sweep
      const allCalls = [...swapCalls, executeCall, sweepCall, swapSweepCall];

      console.log("Executing multicall with", allCalls.length, "calls");

      // Execute multicall
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

  const isActive = saleConfig && saleConfig[3]; // active flag
  const pricePerShare = saleConfig ? saleConfig[0] : 0n;
  const cap = saleConfig ? saleConfig[1] : 0n;

  const estimatedShares = quote?.ok && quote.amountOut ? quote.amountOut : "0";

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <div className="p-3 sm:p-6 max-w-md mx-auto">
          {isSaleConfigLoading && (
            <div className="mb-4 p-3 bg-muted border border-border rounded text-xs sm:text-sm flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading sale information...</span>
            </div>
          )}

          {!isSaleConfigLoading && !isActive && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs sm:text-sm text-yellow-400">
              {t("dao.sale_not_active")}
            </div>
          )}

          {!isSaleConfigLoading && isActive && (
            <div className="space-y-3 sm:space-y-4">
              {/* Sale Info Card */}
              <div className="p-3 sm:p-4 border border-white/20 rounded-xl bg-white/5">
                <div className="flex justify-between items-center text-xs sm:text-sm mb-2">
                  <span className="text-muted-foreground">{t("dao.price_per_share")}</span>
                  <span className="font-mono font-semibold">
                    {pricePerShare.toString()} {payTokenSymbol}
                  </span>
                </div>
                {cap > 0n && (
                  <div className="flex justify-between items-center text-xs sm:text-sm">
                    <span className="text-muted-foreground">{t("dao.remaining_shares")}</span>
                    <span className="font-mono font-semibold">{formatEther(cap)}</span>
                  </div>
                )}
              </div>

              {/* Input Token Panel */}
              {isTokensLoading || !hasBalances ? (
                <div className="z-10 text-foreground">
                  <label className="block text-xs sm:text-sm font-medium mb-2">Pay with</label>
                  <div className="flex items-center justify-center gap-2 py-6 sm:py-8 text-xs sm:text-sm text-muted-foreground border border-white/20 rounded-xl bg-black/40">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading token balances...</span>
                  </div>
                </div>
              ) : (
                <div className="z-10 text-foreground">
                  <label className="block text-xs sm:text-sm font-medium mb-2">Pay with</label>
                  <TradePanel
                    className="rounded-xl"
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

              {/* Quote loading indicator */}
              {isQuoteFetching && (
                <div className="flex items-center justify-center gap-2 py-2 text-xs sm:text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Finding best route...</span>
                </div>
              )}

              {/* Estimated output */}
              {quote?.ok && !isQuoteFetching && inputAmount && Number(inputAmount) > 0 && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-xs sm:text-sm">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
                    <span className="text-muted-foreground">You will receive</span>
                    <span className="font-mono font-semibold text-green-400">~{estimatedShares} ZORG Shares</span>
                  </div>
                </div>
              )}

              <Button
                onClick={!owner ? openConnectModal : handleJoinDAO}
                disabled={
                  owner &&
                  (isExecuting ||
                    isPending ||
                    isConnectorLoading ||
                    !isWalletReady ||
                    !inputAmount ||
                    Number(inputAmount) <= 0 ||
                    !quote?.ok)
                }
                className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold"
              >
                {!owner
                  ? t("common.connect_wallet")
                  : isConnectorLoading
                    ? "Connecting..."
                    : isExecuting || isPending
                      ? "Processing..."
                      : "Join DAO"}
              </Button>

              {/* Errors / Success */}
              {txError && <div className="text-xs sm:text-sm text-red-500 text-center">{txError}</div>}
              {isSuccess && (
                <div className="text-xs sm:text-sm text-green-500 text-center">
                  Successfully joined the DAO! TX: {txHash?.slice(0, 10)}...
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] sm:text-xs text-muted-foreground mt-4 text-center">{t("dao.buy_shares_note")}</p>
        </div>
      )}
    </ConnectButton.Custom>
  );
};
