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
import { Loader2, ArrowRight, Shield, Coins } from "lucide-react";
import { handleWalletError } from "@/lib/errors";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  SystemPanel,
  StepsList,
  VHSButton,
} from "./vhs-ui";

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

  // Fetch user's current ZORG shares balance
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
  const isLoading = isExecuting || isPending;
  const hasValidInput = inputAmount && Number(inputAmount) > 0 && quote?.ok;

  return (
    <ConnectButton.Custom>
      {({ openConnectModal }) => (
        <div className="p-4 sm:p-6 max-w-md mx-auto">
          {/* ====== NFT BANNER ====== */}
          <ZorgNFTBanner />

          {/* ====== CURRENT SHARES BALANCE (if connected) ====== */}
          {owner && (
            <div
              className="mb-5 p-3 sm:p-4 border border-cyan-600/25"
              style={{
                background: "linear-gradient(180deg, rgba(34, 211, 238, 0.06) 0%, rgba(34, 211, 238, 0.02) 100%)",
                borderRadius: "3px",
              }}
            >
              <div className="flex justify-between items-center">
                <span
                  style={{
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "10px",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "rgba(148, 163, 184, 0.8)",
                  }}
                >
                  YOUR ZORG SHARES
                </span>
                <span
                  style={{
                    fontFamily: "'Courier New', ui-monospace, monospace",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#22d3ee",
                    textShadow: "0 0 8px rgba(34, 211, 238, 0.3)",
                  }}
                >
                  {isSharesBalanceLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  ) : (
                    formatEther(zorgSharesBalance ?? 0n)
                  )}
                </span>
              </div>
            </div>
          )}

          {/* ====== LOADING STATE ====== */}
          {isSaleConfigLoading && (
            <div
              className="mb-5 p-4 border border-neutral-700/40 flex items-center justify-center gap-2"
              style={{
                background: "rgba(15, 15, 15, 0.6)",
                borderRadius: "2px",
              }}
            >
              <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
              <span
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "11px",
                  color: "rgba(161, 161, 170, 0.8)",
                }}
              >
                LOADING SALE DATA...
              </span>
            </div>
          )}

          {/* ====== SALE NOT ACTIVE ====== */}
          {!isSaleConfigLoading && !isActive && (
            <div
              className="mb-5 p-4 border border-orange-600/30"
              style={{
                background: "rgba(249, 115, 22, 0.08)",
                borderRadius: "2px",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: "#f97316", boxShadow: "0 0 6px #f97316" }}
                />
                <span
                  style={{
                    fontFamily: "'Courier New', ui-monospace, monospace",
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "#f97316",
                  }}
                >
                  {t("dao.sale_not_active")}
                </span>
              </div>
            </div>
          )}

          {/* ====== MAIN ACTION PANEL ====== */}
          {!isSaleConfigLoading && isActive && (
            <div className="space-y-4">
              {/* Sale Info */}
              <div
                className="p-3 sm:p-4 border border-neutral-700/40"
                style={{
                  background: "linear-gradient(180deg, rgba(20,20,20,0.8) 0%, rgba(12,12,12,0.9) 100%)",
                  borderRadius: "2px",
                }}
              >
                <div className="flex justify-between items-center mb-2">
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "9px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "rgba(113, 113, 122, 0.8)",
                    }}
                  >
                    {t("dao.price_per_share")}
                  </span>
                  <span
                    style={{
                      fontFamily: "'Courier New', ui-monospace, monospace",
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#e5e5e5",
                    }}
                  >
                    {pricePerShare.toString()} {payTokenSymbol}
                  </span>
                </div>
                {cap > 0n && (
                  <div className="flex justify-between items-center">
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "9px",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "rgba(113, 113, 122, 0.8)",
                      }}
                    >
                      {t("dao.remaining_shares")}
                    </span>
                    <span
                      style={{
                        fontFamily: "'Courier New', ui-monospace, monospace",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#e5e5e5",
                      }}
                    >
                      {formatEther(cap)}
                    </span>
                  </div>
                )}
              </div>

              {/* ====== TOKEN INPUT PANEL ====== */}
              {isTokensLoading || !hasBalances ? (
                <div className="z-10 text-foreground">
                  <label
                    className="block mb-2"
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "10px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "rgba(148, 163, 184, 0.8)",
                    }}
                  >
                    PAY WITH
                  </label>
                  <div
                    className="flex items-center justify-center gap-2 py-8 border border-neutral-700/40"
                    style={{
                      background: "rgba(10, 10, 10, 0.6)",
                      borderRadius: "3px",
                    }}
                  >
                    <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "11px",
                        color: "rgba(161, 161, 170, 0.7)",
                      }}
                    >
                      Loading token balances...
                    </span>
                  </div>
                </div>
              ) : (
                <div className="z-10 text-foreground">
                  <label
                    className="block mb-2"
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "10px",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "rgba(148, 163, 184, 0.8)",
                    }}
                  >
                    PAY WITH
                  </label>
                  <TradePanel
                    className="rounded-[3px] border-neutral-700/50"
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
                <div className="flex items-center justify-center gap-2 py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500" />
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "10px",
                      letterSpacing: "0.04em",
                      color: "rgba(34, 211, 238, 0.8)",
                      textTransform: "uppercase",
                    }}
                  >
                    Finding best route...
                  </span>
                </div>
              )}

              {/* ====== ESTIMATED OUTPUT ====== */}
              {quote?.ok && !isQuoteFetching && inputAmount && Number(inputAmount) > 0 && (
                <div
                  className="p-3 sm:p-4 border border-green-600/30"
                  style={{
                    background: "linear-gradient(180deg, rgba(34, 197, 94, 0.08) 0%, rgba(34, 197, 94, 0.03) 100%)",
                    borderRadius: "3px",
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "10px",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "rgba(148, 163, 184, 0.7)",
                      }}
                    >
                      YOU WILL RECEIVE
                    </span>
                    <span
                      style={{
                        fontFamily: "'Courier New', ui-monospace, monospace",
                        fontSize: "14px",
                        fontWeight: 700,
                        color: "#22c55e",
                        textShadow: "0 0 8px rgba(34, 197, 94, 0.4)",
                      }}
                    >
                      ~{estimatedShares} ZORG SHARES
                    </span>
                  </div>
                </div>
              )}

              {/* ====== PRIMARY CTA BUTTON ====== */}
              <VHSButton
                variant="primary"
                size="lg"
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
                loading={isLoading}
                className="w-full"
              >
                {!owner ? (
                  <>
                    <Shield className="h-4 w-4" />
                    CONNECT WALLET
                  </>
                ) : isConnectorLoading ? (
                  "CONNECTING..."
                ) : isLoading ? (
                  "PROCESSING..."
                ) : (
                  <>
                    <Coins className="h-4 w-4" />
                    JOIN DAO
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </VHSButton>

              {/* ====== ERROR/SUCCESS MESSAGES ====== */}
              {txError && (
                <div
                  className="p-3 border border-red-600/30"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    borderRadius: "2px",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "ui-monospace, monospace",
                      fontSize: "11px",
                      color: "#ef4444",
                    }}
                  >
                    {txError}
                  </span>
                </div>
              )}

              {isSuccess && (
                <div
                  className="p-3 border border-green-600/30"
                  style={{
                    background: "rgba(34, 197, 94, 0.08)",
                    borderRadius: "2px",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}
                    />
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "11px",
                        color: "#22c55e",
                      }}
                    >
                      Successfully joined the DAO! TX: {txHash?.slice(0, 10)}...
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ====== REQUIREMENTS/STEPS PANEL ====== */}
          <div className="mt-6">
            <SystemPanel title="HOW IT WORKS" level="INFO">
              <StepsList
                steps={[
                  {
                    number: "01",
                    title: "SELECT PAYMENT",
                    description: "Choose ETH or ZAMM to purchase shares",
                    status: hasValidInput ? "complete" : owner ? "active" : "pending",
                  },
                  {
                    number: "02",
                    title: "CONFIRM TRANSACTION",
                    description: "Approve and execute the purchase",
                    status: isSuccess ? "complete" : hasValidInput ? "active" : "pending",
                  },
                  {
                    number: "03",
                    title: "RECEIVE SHARES",
                    description: "Governance shares transfer to your wallet",
                    status: isSuccess ? "complete" : "pending",
                  },
                ]}
              />
            </SystemPanel>
          </div>

          {/* ====== FOOTER NOTE ====== */}
          <p
            className="mt-4 text-center"
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "9px",
              letterSpacing: "0.04em",
              color: "rgba(113, 113, 122, 0.6)",
            }}
          >
            {t("dao.buy_shares_note")}
          </p>
        </div>
      )}
    </ConnectButton.Custom>
  );
};
