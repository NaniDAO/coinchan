import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
    useWaitForTransactionReceipt,
    useAccount,
    useReadContract,
    usePublicClient,
    useChainId,
    useSendTransaction,
} from "wagmi";
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES } from "@/constants/ZORG";
import { ZRouterAddress, ZRouterAbi } from "@/constants/ZRouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
    encodeFunctionData,
    parseUnits,
    formatUnits,
    formatEther,
    maxUint256,
} from "viem";
import { mainnet } from "viem/chains";
import { useGetTokens } from "@/hooks/use-get-tokens";
import { useZRouterQuote } from "@/hooks/use-zrouter-quote";
import { TradePanel } from "@/components/trade/TradePanel";
import {
    ETH_TOKEN,
    ZAMM_TOKEN,
    ZAMM_ERC20_TOKEN,
    type TokenMetadata,
} from "@/lib/pools";
import {
    buildRoutePlan,
    checkRouteApprovals,
    erc20Abi,
    zRouterAbi,
} from "zrouter-sdk";
import { CoinsAbi } from "@/constants/Coins";
import { Loader2 } from "lucide-react";
import { handleWalletError } from "@/lib/errors";

export const JoinDAO = () => {
    const { t } = useTranslation();
    const { address: owner, isConnected } = useAccount();
    const { data: tokens = [] } = useGetTokens(owner);
    const publicClient = usePublicClient();
    const chainId = useChainId();

    const [inputToken, setInputToken] = useState<TokenMetadata>(ETH_TOKEN);
    const [inputAmount, setInputAmount] = useState("");
    const [isExecuting, setIsExecuting] = useState(false);
    const [txError, setTxError] = useState<string | null>(null);

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
    const { data: zammSaleConfig } = useReadContract({
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
        enabled:
            !!publicClient && !!debouncedAmount && Number(debouncedAmount) > 0,
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
                                      args: [
                                          approval.operator,
                                          approval.approved,
                                      ],
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
            const paymentOutput = parseUnits(
                selectedRoute.amountOut,
                targetToken.decimals ?? 18,
            );

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
            const allCalls = [
                ...swapCalls,
                executeCall,
                sweepCall,
                swapSweepCall,
            ];

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

    const estimatedShares =
        quote?.ok && quote.amountOut ? quote.amountOut : "0";

    return (
        <div className="p-6">
            <h3 className="text-lg font-semibold mb-4">{t("dao.join_dao")}</h3>

            {!isActive && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">
                    {t("dao.sale_not_active")}
                </div>
            )}

            {isActive && (
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between text-xs text-muted-foreground mb-2">
                            <span>{t("dao.price_per_share")}</span>
                            <span className="font-mono">
                                {formatEther(pricePerShare)} {payTokenSymbol}
                            </span>
                        </div>
                        {cap > 0n && (
                            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                                <span>{t("dao.remaining_shares")}</span>
                                <span className="font-mono">
                                    {formatEther(cap)}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Input Token Panel */}
                    <div className="z-10 bg-background text-foreground">
                        <label className="block text-sm font-medium mb-2">
                            Pay with
                        </label>
                        <TradePanel
                            className="rounded-2xl"
                            title="Sell"
                            selectedToken={inputToken}
                            tokens={tokens}
                            onSelect={setInputToken}
                            amount={inputAmount}
                            onAmountChange={(val) => {
                                setInputAmount(val);
                                setTxError(null);
                            }}
                            showMaxButton={
                                !!(
                                    inputToken?.balance &&
                                    BigInt(inputToken.balance) > 0n
                                )
                            }
                            onMax={() => {
                                if (!inputToken?.balance) return;
                                const decimals = inputToken.decimals ?? 18;
                                setInputAmount(
                                    formatUnits(
                                        inputToken.balance as bigint,
                                        decimals,
                                    ),
                                );
                                setTxError(null);
                            }}
                            showPercentageSlider={
                                !!(
                                    inputToken?.balance &&
                                    BigInt(inputToken.balance) > 0n
                                )
                            }
                            locked={false}
                        />
                    </div>

                    {/* Quote loading indicator */}
                    {isQuoteFetching && (
                        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Finding best route...</span>
                        </div>
                    )}

                    {/* Estimated output */}
                    {quote?.ok &&
                        !isQuoteFetching &&
                        inputAmount &&
                        Number(inputAmount) > 0 && (
                            <div className="p-3 bg-muted rounded text-sm space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">
                                        You will receive
                                    </span>
                                    <span className="font-mono font-semibold">
                                        ~{estimatedShares} ZORG Shares
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                        Route
                                    </span>
                                    <span className="font-mono">
                                        {inputToken.symbol} → {payTokenSymbol} →
                                        ZORG Shares
                                    </span>
                                </div>
                                {quote.routes && quote.routes[0] && (
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted-foreground">
                                            Via
                                        </span>
                                        <span className="font-mono">
                                            {quote.routes[0].venue}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                    <Button
                        onClick={handleJoinDAO}
                        disabled={
                            !owner ||
                            isExecuting ||
                            isPending ||
                            !inputAmount ||
                            Number(inputAmount) <= 0 ||
                            !quote?.ok
                        }
                        className="w-full"
                    >
                        {!owner
                            ? t("common.connect_wallet")
                            : isExecuting || isPending
                              ? "Processing..."
                              : "Join DAO"}
                    </Button>

                    {/* Errors / Success */}
                    {txError && (
                        <div className="text-sm text-red-500">{txError}</div>
                    )}
                    {isSuccess && (
                        <div className="text-sm text-green-500">
                            Successfully joined the DAO! TX:{" "}
                            {txHash?.slice(0, 10)}...
                        </div>
                    )}
                </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
                {t("dao.buy_shares_note")}
            </p>
        </div>
    );
};
