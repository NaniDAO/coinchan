import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatImageURL } from "@/hooks/metadata";
import type { IncentiveStream } from "@/hooks/use-incentive-streams";
import { useLpBalance } from "@/hooks/use-lp-balance";
import { useLpOperatorStatus } from "@/hooks/use-lp-operator-status";
import { useStreamValidation } from "@/hooks/use-stream-validation";
import {
  useZapCalculations,
  calculateMaxEthForZap,
} from "@/hooks/use-zap-calculations";
import { useZapDeposit } from "@/hooks/use-zap-deposit";
import {
  useZChefActions,
  useZChefUserBalance,
  useZChefPool,
  useSetOperatorApproval,
} from "@/hooks/use-zchef-contract";
import { ZChefAddress } from "@/constants/zChef";
import {
  ETH_TOKEN,
  ENS_POOL_ID,
  WLFI_POOL_ID,
  type TokenMeta,
} from "@/lib/coins";
import { isUserRejectionError } from "@/lib/errors";
import { cn, formatBalance } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { useAccount, useBalance, usePublicClient } from "wagmi";
import { APRDisplay } from "./farm/APRDisplay";
import { ENSLogo } from "./icons/ENSLogo";
import { LpTokensTab } from "./farm/LpTokensTab";
import { EthZapTab } from "./farm/EthZapTab";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";

interface FarmStakeDialogProps {
  stream: IncentiveStream;
  lpToken: TokenMeta;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

export type StakeMode = "lp" | "eth";

// Format liquidity amounts for compact display
const formatCompactLiquidity = (value: number): string => {
  if (value === 0) return "0";
  if (value < 0.0001) return "<0.0001";
  if (value < 1) return value.toFixed(4);
  if (value < 1000) return value.toFixed(2);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
};

export function FarmStakeDialog({
  stream,
  lpToken,
  trigger,
  onSuccess,
}: FarmStakeDialogProps) {
  const { t } = useTranslation();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { data: ethBalance } = useBalance({ address });

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [stakeMode, setStakeMode] = useState<StakeMode>("lp");
  const [zapCalculation, setZapCalculation] = useState<any>(null);
  const [slippageBps, setSlippageBps] = useState(1000n); // 10%
  const [customSlippage, setCustomSlippage] = useState("10");
  const [showSlippageSettings, setShowSlippageSettings] = useState(false);

  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<
    "idle" | "pending" | "confirming" | "success" | "error"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txMessage, setTxMessage] = useState<string | null>(null);

  const { deposit } = useZChefActions();
  const { calculateZapAmounts } = useZapCalculations();
  const zapDeposit = useZapDeposit();
  const { validateStreamBeforeAction } = useStreamValidation();
  const setOperatorApproval = useSetOperatorApproval();

  // User staked balance
  const { data: userStakedBalance } = useZChefUserBalance(stream.chefId);

  // Pool data
  const { data: poolData } = useZChefPool(stream.chefId);
  const totalStaked = poolData?.[7] ?? stream.totalShares ?? 0n;

  // LP balance
  const { balance: lpTokenBalance, isLoading: isLpBalanceLoading } =
    useLpBalance({ lpToken, poolId: stream.lpId, enabled: stakeMode === "lp" });

  // ETH token
  const ethToken = useMemo(() => {
    return {
      ...ETH_TOKEN,
      balance: ethBalance === undefined ? 0n : ethBalance.value,
    };
  }, [ethBalance]);

  // Operator status (ERC6909)
  const { data: isOperatorApproved } = useLpOperatorStatus({
    owner: address,
    operator: ZChefAddress,
    source: lpToken?.source || "COOKBOOK",
  });

  // Max ETH for zap by liquidity
  const maxEthForZap = useMemo(() => {
    if (
      !lpToken ||
      !lpToken.reserve0 ||
      !lpToken.reserve1 ||
      lpToken.reserve0 === 0n ||
      lpToken.reserve1 === 0n
    )
      return 0n;
    try {
      return calculateMaxEthForZap(
        lpToken.reserve0,
        lpToken.reserve1,
        slippageBps,
      );
    } catch {
      return 0n;
    }
  }, [lpToken, lpToken?.reserve0, lpToken?.reserve1, slippageBps]);

  const maxAmount =
    stakeMode === "lp"
      ? lpTokenBalance > 0n
        ? formatUnits(lpTokenBalance, 18)
        : "0"
      : ethToken.balance
        ? formatEther(
            ethToken.balance < maxEthForZap ? ethToken.balance : maxEthForZap,
          )
        : "0";

  // Debounced zap calculation
  const debounceTimerRef = useRef<NodeJS.Timeout>();
  const debouncedZapCalculation = useCallback(
    (ethAmount: string) => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const result = await calculateZapAmounts(
            ethAmount,
            stream,
            lpToken,
            slippageBps,
          );
          setZapCalculation(result);
        } catch (e) {
          console.error("Zap calculation failed:", e);
          setZapCalculation(null);
        }
      }, 500);
    },
    [calculateZapAmounts, stream, lpToken, slippageBps],
  );

  useEffect(() => {
    if (stakeMode === "eth" && amount && Number.parseFloat(amount) > 0) {
      debouncedZapCalculation(amount);
    } else {
      setZapCalculation(null);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [amount, stakeMode, debouncedZapCalculation]);

  // Force LP for CULT
  useEffect(() => {
    if (lpToken?.symbol === "CULT" && stakeMode === "eth") setStakeMode("lp");
  }, [lpToken?.symbol, stakeMode]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setAmount("");
      setZapCalculation(null);
      setTxHash(null);
      setTxError(null);
      setTxMessage(null);
      setTxStatus("idle");
      setShowSlippageSettings(false);
    }
  }, [open]);

  const handleStake = async () => {
    if (!amount || Number.parseFloat(amount) <= 0) return;

    const validation = validateStreamBeforeAction(stream, "stake");
    if (!validation.canProceed) {
      setTxStatus("error");
      setTxError(validation.error || t("common.cannot_stake_at_this_time"));
      return;
    }

    try {
      setTxStatus("pending");
      setTxError(null);

      // Need operator approval for LP flow
      if (stakeMode === "lp" && !isOperatorApproved) {
        try {
          setTxHash(null);
          setTxMessage(t("common.approving_operator"));
          const approvalHash = await setOperatorApproval.mutateAsync({
            source: lpToken?.source || "COOKBOOK",
            operator: ZChefAddress,
            approved: true,
          });
          setTxHash(approvalHash);
          setTxStatus("confirming");
          setTxMessage(t("common.waiting_for_operator_approval"));
          if (publicClient) {
            await publicClient.waitForTransactionReceipt({
              hash: approvalHash as `0x${string}`,
            });
          }
          setTxStatus("pending");
          setTxMessage(t("common.operator_approved_proceeding"));
          setTxHash(null);
          await new Promise((r) => setTimeout(r, 500));
        } catch (approvalError: any) {
          if (isUserRejectionError(approvalError)) {
            setTxStatus("idle");
            setTxMessage(null);
            return;
          }
          setTxStatus("error");
          setTxError(t("common.operator_approval_failed"));
          setTxMessage(null);
          return;
        }
      }

      // Stake
      let hash: string;
      if (stakeMode === "lp") {
        const amountBigInt = parseUnits(amount, lpToken.decimals || 18);
        hash = await deposit.mutateAsync({
          chefId: stream.chefId,
          amount: amountBigInt,
        });
      } else {
        if (!zapCalculation || !zapCalculation.isValid)
          throw new Error(t("common.invalid_zap_calculation"));
        const ethAmountBigInt = parseEther(amount);
        hash = await zapDeposit.mutateAsync({
          chefId: stream.chefId,
          ethAmount: ethAmountBigInt,
          zapCalculation,
        });
      }

      setTxHash(hash);
      setTxStatus("confirming");
      setTxMessage(null);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
        });
        setTxStatus("success");
        setTimeout(() => {
          setAmount("");
          setOpen(false);
          setTxStatus("idle");
          setTxHash(null);
          setTxMessage(null);
          onSuccess?.();
        }, 3000);
      }
    } catch (error: any) {
      if (isUserRejectionError(error)) {
        setTxStatus("idle");
        setTxMessage(null);
      } else {
        console.error("Stake failed:", error);
        setTxStatus("error");
        setTxError(error?.message || t("common.staking_failed"));
        setTxMessage(null);
        setTimeout(() => {
          setTxStatus("idle");
          setTxError(null);
        }, 5000);
      }
    }
  };

  const handleMaxClick = () => {
    setAmount(maxAmount);
  };

  const handleSlippageChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0.1 && numValue <= 50) {
      setCustomSlippage(value);
      setSlippageBps(BigInt(Math.floor(numValue * 100)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl w-[95vw] min-h-0 max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-2 border-border shadow-[4px_4px_0_var(--border)]">
        <DialogHeader className="sr-only">
          <DialogTitle>{t("common.stake")}</DialogTitle>
        </DialogHeader>

        <div key={stakeMode} className="space-y-6">
          {/* Pool Information */}
          <div className="border border-primary/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {BigInt(stream.lpId) === ENS_POOL_ID ? (
                  <div className="relative">
                    <ENSLogo className="w-8 h-8" />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                ) : BigInt(stream.lpId) === WLFI_POOL_ID ? (
                  <div className="relative">
                    <img
                      src="/wlfi.png"
                      alt="WLFI"
                      className="w-8 h-8 rounded-full border-2 border-primary/40"
                    />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                ) : lpToken?.imageUrl ? (
                  <div className="relative">
                    <img
                      src={formatImageURL(lpToken.imageUrl)}
                      alt={lpToken.symbol}
                      className="w-8 h-8 rounded-full border-2 border-primary/40"
                    />
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 to-transparent opacity-50 blur-sm"></div>
                  </div>
                ) : null}
                <div>
                  <h3 className="font-mono font-bold text-lg text-primary break-all">
                    {BigInt(stream.lpId) === ENS_POOL_ID
                      ? "ENS"
                      : BigInt(stream.lpId) === WLFI_POOL_ID
                        ? "WLFI"
                        : lpToken?.symbol ||
                          (() => {
                            const lpId = stream.lpId?.toString();
                            return lpId && lpId.length > 12
                              ? `Pool ${lpId.slice(0, 6)}...${lpId.slice(-6)}`
                              : `Pool ${lpId}`;
                          })()}
                  </h3>
                  <p className="text-xs text-muted-foreground font-mono">
                    {t("common.lp_token_pool")}
                  </p>
                </div>
              </div>
              <div
                className={cn(
                  "px-3 py-1 rounded text-xs font-mono font-bold",
                  stream.status === "ACTIVE"
                    ? "bg-green-500/10 text-green-500 border border-green-500/30"
                    : "bg-muted/10 text-muted-foreground border border-muted/30",
                )}
              >
                {stream.status || t("common.active").toUpperCase()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="bg-background/30 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono text-xs">
                  {t("common.reward_token")}
                </p>
                <p className="font-mono font-bold text-primary">
                  {stream.rewardCoin?.symbol}
                </p>
              </div>
              {lpToken && (
                <div className="bg-background/30 border border-primary/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">
                    {t("pool.liquidity")}
                  </p>
                  <p className="font-mono font-bold text-primary">
                    {formatCompactLiquidity(
                      Number(
                        formatEther(
                          lpToken.reserve0 || lpToken.liquidity || 0n,
                        ),
                      ),
                    )}{" "}
                    ETH
                  </p>
                </div>
              )}
              {lpToken && lpToken.reserve1 ? (
                <div className="bg-background/30 border border-primary/20 rounded p-3">
                  <p className="text-muted-foreground font-mono text-xs">
                    {BigInt(stream.lpId) === ENS_POOL_ID
                      ? "ENS"
                      : BigInt(stream.lpId) === WLFI_POOL_ID
                        ? "WLFI"
                        : lpToken.symbol}{" "}
                    {t("common.reserves")}
                  </p>
                  <p className="font-mono font-bold text-primary">
                    {formatBalance(
                      formatUnits(lpToken.reserve1, lpToken.decimals || 18),
                      BigInt(stream.lpId) === ENS_POOL_ID
                        ? "ENS"
                        : BigInt(stream.lpId) === WLFI_POOL_ID
                          ? "WLFI"
                          : lpToken.symbol,
                    )}
                  </p>
                </div>
              ) : null}
              <div className="bg-background/30 border border-primary/20 rounded p-3">
                <p className="text-muted-foreground font-mono text-xs">
                  {t("common.total_staked")}
                </p>
                <p className="font-mono font-bold text-primary">
                  {formatBalance(formatEther(totalStaked), "LP")}
                </p>
              </div>
            </div>
          </div>

          <APRDisplay stream={stream} lpToken={lpToken} shortView={false} />

          {/* User position */}
          {userStakedBalance && userStakedBalance > 0n && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-mono uppercase">
                    {t("common.your_stake")}
                  </p>
                  <p className="font-mono font-bold text-green-500 text-lg mt-1">
                    {formatBalance(formatEther(userStakedBalance), "LP")}
                  </p>
                </div>
                <div className="text-xs text-green-500/80 font-mono">
                  [{t("common.staked")}]
                </div>
              </div>
            </div>
          )}

          {/* Stake mode */}
          {lpToken?.symbol === "CULT" ? (
            <div className="space-y-3">
              <Label className="font-mono font-bold text-primary uppercase tracking-wide">
                <span className="text-muted-foreground">&gt;</span>{" "}
                {t("common.stake_mode")}
              </Label>
              <div className="font-mono text-sm text-muted-foreground">
                [{t("common.lp_tokens")}] - ETH zap not available for CULT pools
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label className="font-mono font-bold text-primary uppercase tracking-wide">
                <span className="text-muted-foreground">&gt;</span>{" "}
                {t("common.stake_mode")}
              </Label>
              <Tabs
                value={stakeMode}
                onValueChange={(value) => {
                  setStakeMode(value as StakeMode);
                  setAmount("");
                  setZapCalculation(null);
                }}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger
                    value="lp"
                    className="font-mono font-bold tracking-wide"
                  >
                    [{t("common.lp_tokens")}]
                  </TabsTrigger>
                  <TabsTrigger
                    value="eth"
                    className="font-mono font-bold tracking-wide"
                  >
                    [{t("common.eth_zap")}]
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}

          {/* Tab bodies */}
          {stakeMode === "lp" ? (
            <LpTokensTab
              t={t}
              amount={amount}
              setAmount={setAmount}
              maxAmount={maxAmount}
              isOperatorApproved={!!isOperatorApproved}
              isLpBalanceLoading={isLpBalanceLoading}
              onMaxClick={handleMaxClick}
              onStakeClick={handleStake}
              stakeDisabled={
                !amount ||
                Number.parseFloat(amount) <= 0 ||
                Number.parseFloat(amount) > Number.parseFloat(maxAmount) ||
                txStatus !== "idle" ||
                deposit.isPending
              }
            />
          ) : (
            <EthZapTab
              t={t}
              amount={amount}
              setAmount={setAmount}
              maxAmount={maxAmount}
              onMaxClick={handleMaxClick}
              onStakeClick={handleStake}
              stakeDisabled={
                !amount ||
                Number.parseFloat(amount) <= 0 ||
                Number.parseFloat(amount) > Number.parseFloat(maxAmount) ||
                txStatus !== "idle" ||
                zapDeposit.isPending ||
                !zapCalculation?.isValid
              }
              customSlippage={customSlippage}
              setCustomSlippage={handleSlippageChange}
              showSlippageSettings={showSlippageSettings}
              setShowSlippageSettings={setShowSlippageSettings}
              zapCalculation={zapCalculation}
              slippageBps={slippageBps}
              lpToken={lpToken}
              maxEthForZap={maxEthForZap}
            />
          )}

          {/* Transaction Monitoring */}
          {txStatus !== "idle" && (
            <div
              className={cn(
                "border rounded-lg p-4 transition-all duration-300",
                txStatus === "success"
                  ? "bg-green-500/10 border-green-500/30"
                  : txStatus === "error"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-primary/10 border-primary/30",
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-2">
                  {txStatus === "pending" && (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                      <span className="font-mono font-bold text-primary">
                        [{t("common.status_pending")}]
                      </span>
                    </>
                  )}
                  {txStatus === "confirming" && (
                    <>
                      <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                      <span className="font-mono font-bold text-yellow-500">
                        [{t("common.status_confirming")}]
                      </span>
                    </>
                  )}
                  {txStatus === "success" && (
                    <>
                      <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                      <span className="font-mono font-bold text-green-500">
                        [{t("common.status_success")}]
                      </span>
                    </>
                  )}
                  {txStatus === "error" && (
                    <>
                      <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                      <span className="font-mono font-bold text-red-500">
                        [{t("common.status_error")}]
                      </span>
                    </>
                  )}
                </div>

                {txHash && (
                  <div className="text-center">
                    <a
                      href={`https://etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-background/50 border border-primary/20 rounded font-mono text-xs hover:bg-primary/10 transition-colors duration-200"
                    >
                      <span className="text-muted-foreground">
                        {t("common.tx_label")}:
                      </span>
                      <span className="text-primary font-bold">
                        {txHash.slice(0, 6)}...{txHash.slice(-4)}
                      </span>
                      <span className="text-muted-foreground">
                        {t("common.external_link")}
                      </span>
                    </a>
                  </div>
                )}

                {txMessage && !txError && (
                  <div className="text-center">
                    <p className="text-sm text-primary font-mono break-words">
                      {txMessage}
                    </p>
                  </div>
                )}
                {txError && (
                  <div className="text-center">
                    <p className="text-sm text-red-400 font-mono break-words">
                      {txError}
                    </p>
                  </div>
                )}
                {txStatus === "success" && (
                  <div className="text-center">
                    <p className="text-sm text-green-400 font-mono">
                      {stakeMode === "eth"
                        ? t("common.eth_zapped_staked_success")
                        : t("common.lp_tokens_staked_success")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Display */}
          {(deposit.error || zapDeposit.error) &&
            txStatus === "idle" &&
            !isUserRejectionError(deposit.error) &&
            !isUserRejectionError(zapDeposit.error) && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <div className="text-sm text-red-400 text-center font-mono break-words">
                  [ERROR]: {deposit.error?.message || zapDeposit.error?.message}
                </div>
              </div>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
