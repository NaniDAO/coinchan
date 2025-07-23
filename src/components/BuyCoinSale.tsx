/*  BuyCoinSale.ts
    —————————————————————————————————————————————————————————————————
    • Two modes: “Spend ETH” and “Buy Tokens”.
    • Prevents unfillable dust by always trading whole atomic lots:
        • ETH mode – msg.value rounded ↓ to multiple of P*.
        • Token mode – tokenQty rounded ↓ to multiple of C*,
          msg.value = lots · P*.
    • Includes dust-sweeper button (unchanged logic).
   ------------------------------------------------------------------ */

import { ZAMMLaunchAbi, ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { useChartTheme } from "@/hooks/use-chart-theme";
import { useCoinSale } from "@/hooks/use-coin-sale";
import { cn } from "@/lib/utils";
import { formatDeadline } from "@/lib/utils";
import { Clock } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatEther, parseEther } from "viem";
import { useAccount, useBalance, usePublicClient, useWriteContract } from "wagmi";
import { BuySellCookbookCoin } from "./BuySellCookbookCoin";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { PillIndicator } from "./ui/pill";

/* ───────── helpers ───────── */

const statusToPillVariant = (s: string) => (s === "ACTIVE" ? "success" : s === "FINALIZED" ? "info" : "error");

/* ───────── types ───────── */

interface Tranche {
  coins: string;
  deadline: string;
  price: string;
  remaining: string;
  trancheIndex: number;
  sold: string;
}

/* ───────── component ───────── */

export const BuyCoinSale = ({
  coinId,
  symbol,
  onPriceImpactChange,
}: {
  coinId: bigint;
  symbol: string;
  onPriceImpactChange?: (
    impact: {
      currentPrice: number;
      projectedPrice: number;
      impactPercent: number;
      action: "buy" | "sell";
    } | null,
  ) => void;
}) => {
  /* chain + account hooks */
  const { data: sale, isLoading } = useCoinSale({ coinId: coinId.toString() });
  const { writeContract } = useWriteContract();
  const publicClient = usePublicClient();
  const { address } = useAccount();
  const { data: balanceData } = useBalance({ address });
  const { t } = useTranslation();

  /* ui state */
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<"ETH" | "TOKEN">("ETH");
  const [ethInput, setEthInput] = useState<string>("");
  const [tokenInput, setTokenInput] = useState<string>("");

  /* contract data */
  const [remainderWei, setRemainderWei] = useState<bigint | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* get cheapest available tranche (enforces sequential filling) */
  const cheapestAvailableTranche = useMemo(() => {
    if (!sale) return null;
    const active = sale.tranches.items.filter(
      (t: Tranche) => BigInt(t.remaining) > 0n && Number(t.deadline) * 1000 > Date.now(),
    );
    if (!active.length) return null;

    // Sort by price and return the cheapest unfilled tranche
    return active.reduce((cheapest: Tranche, current: Tranche) =>
      BigInt(cheapest.price) < BigInt(current.price) ? cheapest : current,
    );
  }, [sale]);

  /* auto-select cheapest available tranche */
  useEffect(() => {
    if (cheapestAvailableTranche) {
      setSelected(cheapestAvailableTranche.trancheIndex);
    }
  }, [cheapestAvailableTranche]);

  const tranche: Tranche | undefined = useMemo(
    () => sale?.tranches.items.find((t: Tranche) => t.trancheIndex === selected),
    [sale, selected],
  );

  /* check if a tranche is selectable (only cheapest available can be selected) */
  const isTrancheSelectable = useCallback(
    (trancheToCheck: Tranche) => {
      return cheapestAvailableTranche?.trancheIndex === trancheToCheck.trancheIndex;
    },
    [cheapestAvailableTranche],
  );

  /* refresh remainderWei and remainderCoins after each tx */
  const [remainderCoins, setRemainderCoins] = useState<bigint | null>(null);

  useEffect(() => {
    (async () => {
      if (!tranche || !publicClient) {
        setRemainderWei(null);
        setRemainderCoins(null);
        return;
      }

      const [remWei, remCoins] = await Promise.all([
        publicClient.readContract({
          address: ZAMMLaunchAddress,
          abi: ZAMMLaunchAbi,
          functionName: "trancheRemainingWei",
          args: [coinId, BigInt(tranche.trancheIndex)],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: ZAMMLaunchAddress,
          abi: ZAMMLaunchAbi,
          functionName: "trancheRemainingCoins",
          args: [coinId, BigInt(tranche.trancheIndex)],
        }) as Promise<bigint>,
      ]);

      setRemainderWei(remWei);
      setRemainderCoins(remCoins);
    })();
  }, [tranche, refreshKey, publicClient, coinId]);

  /* Calculate exact purchase amounts based on ZAMMLaunch contract logic */
  const purchaseCalculations = useMemo(() => {
    if (!tranche) return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };

    const coinsInTranche = BigInt(tranche.coins);
    const ethPrice = BigInt(tranche.price);

    // Safety checks
    if (coinsInTranche === 0n || ethPrice === 0n) {
      return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };
    }

    if (mode === "ETH") {
      try {
        const inputWei = ethInput.trim() ? parseEther(ethInput.trim()) : 0n;
        if (inputWei === 0n) return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };

        // Check if input creates valid ratio (no remainder when doing mulmod)
        const mulmodResult = (inputWei * coinsInTranche) % ethPrice;
        if (mulmodResult !== 0n) {
          // Round down to valid amount
          const validAmount = inputWei - mulmodResult;
          if (validAmount === 0n) {
            return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };
          }
          const coinAmount = (validAmount * coinsInTranche) / ethPrice;
          return { validEthAmount: validAmount, validCoinAmount: coinAmount, ethCost: validAmount, canPurchase: true };
        }

        const coinAmount = (inputWei * coinsInTranche) / ethPrice;
        return { validEthAmount: inputWei, validCoinAmount: coinAmount, ethCost: inputWei, canPurchase: true };
      } catch {
        return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };
      }
    } else {
      // TOKEN mode - exact coins
      try {
        const desiredCoins = tokenInput.trim() ? parseEther(tokenInput.trim()) : 0n;
        if (desiredCoins === 0n) return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };

        // Calculate exact ETH cost using ZAMMLaunch logic
        const numerator = desiredCoins * ethPrice;
        if (numerator % coinsInTranche !== 0n) {
          return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };
        }

        const ethCost = numerator / coinsInTranche;

        // Sanity check - ensure cost is reasonable
        if (ethCost === 0n) {
          return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };
        }
        return { validEthAmount: ethCost, validCoinAmount: desiredCoins, ethCost, canPurchase: true };
      } catch {
        return { validEthAmount: 0n, validCoinAmount: 0n, ethCost: 0n, canPurchase: false };
      }
    }
  }, [ethInput, tokenInput, mode, tranche]);

  /* estimates based on new calculations */
  const estimateTokens = useMemo(() => {
    if (mode !== "ETH" || !purchaseCalculations.canPurchase) return undefined;
    return formatEther(purchaseCalculations.validCoinAmount);
  }, [mode, purchaseCalculations]);

  const estimateEth = useMemo(() => {
    if (mode !== "TOKEN" || !purchaseCalculations.canPurchase) return undefined;
    return formatEther(purchaseCalculations.ethCost);
  }, [mode, purchaseCalculations]);

  /* sweep eligibility - use contract view helper */
  const sweepable = remainderWei !== null && remainderWei > 0n;

  const onTxSent = () => setRefreshKey((k) => k + 1);

  /* handle MAX */
  const handleMax = () => {
    if (!tranche) return;
    if (mode === "ETH") {
      if (balanceData?.value) setEthInput(formatEther(balanceData.value));
    } else {
      // Use actual remaining coins from contract
      if (remainderCoins !== null && remainderCoins > 0n) {
        setTokenInput(formatEther(remainderCoins));
      }
    }
  };

  /* early exits */
  if (isLoading) return <div>{t("sale.loading")}</div>;
  if (!sale) return <div>{t("sale.not_found")}</div>;
  if (sale.status === "FINALIZED")
    return <BuySellCookbookCoin coinId={coinId} symbol={symbol} onPriceImpactChange={onPriceImpactChange} />;

  const activeTranches = sale.tranches.items
    .filter((t: Tranche) => BigInt(t.remaining) > 0n && Number(t.deadline) * 1000 > Date.now())
    .sort((a: Tranche, b: Tranche) => {
      // Sort by price ascending for consistent ordering
      const priceA = BigInt(a.price);
      const priceB = BigInt(b.price);
      return priceA < priceB ? -1 : priceA > priceB ? 1 : 0;
    });

  /* chart data */
  const chartData = sale.tranches.items.map((t: Tranche) => ({
    name: `Tranche ${t.trancheIndex}`,
    sold: Number(formatEther(BigInt(t.sold))),
    remaining: Number(formatEther(BigInt(t.remaining))),
    price: Number(formatEther(BigInt(t.price))),
    priceNum: Number(formatEther(BigInt(t.price))),
    deadline: new Date(Number(t.deadline) * 1000).toLocaleString(),
    trancheIndex: t.trancheIndex,
    isSelected: t.trancheIndex === selected,
  }));

  /* chart theme */
  const chartTheme = useChartTheme();

  /* ─────────────────────────── JSX ─────────────────────────── */

  // Get the overall tranche sale deadline (deadlineLast)
  const saleDeadlineInfo = sale.deadlineLast ? formatDeadline(Number(sale.deadlineLast)) : null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-mono text-xl">{t("sale.title")}</CardTitle>
        <CardAction>
          <Badge variant="outline" className="font-mono">
            <PillIndicator variant={statusToPillVariant(sale.status)} pulse />
            <span className="ml-1">{sale.status}</span>
          </Badge>
        </CardAction>
      </CardHeader>

      {/* Sale deadline banner */}
      {saleDeadlineInfo && (
        <div
          className={cn(
            "mx-6 mb-4 p-3 border-2 font-mono text-sm font-bold flex items-center gap-2 shadow-[4px_4px_0_var(--border)] bg-card",
            saleDeadlineInfo.urgency === "expired" && "border-destructive text-destructive bg-destructive/10",
            saleDeadlineInfo.urgency === "urgent" &&
              "border-orange-500 text-orange-700 dark:text-orange-300 bg-orange-500/10 animate-pulse",
            saleDeadlineInfo.urgency === "warning" &&
              "border-yellow-500 text-yellow-700 dark:text-yellow-300 bg-yellow-500/10",
            saleDeadlineInfo.urgency === "normal" &&
              "border-green-500 text-green-700 dark:text-green-300 bg-green-500/10",
          )}
        >
          <Clock size={16} />
          {saleDeadlineInfo.urgency === "expired"
            ? "Sale finalization deadline expired"
            : `Sale finalization deadline: ${saleDeadlineInfo.text}`}
        </div>
      )}

      <CardContent>
        <div className="font-mono text-sm mb-6">
          {t("sale.supply")} {formatEther(BigInt(sale.saleSupply))} {symbol}
        </div>

        <h3 className="font-mono text-lg font-bold mb-4">{t("sale.tranches")}</h3>
        <Card className="p-4 mb-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                {/* … same svg gradients, axes, tooltip, bars & line as previous version … */}
                <defs>
                  <linearGradient id="soldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.downColor} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={chartTheme.downColor} stopOpacity={0.2} />
                  </linearGradient>

                  <linearGradient id="remainingGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.upColor} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={chartTheme.upColor} stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chartTheme.lineColor} stopOpacity={0.8} />
                    <stop offset="100%" stopColor={chartTheme.lineColor} stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={chartTheme.lineColor} />
                    <stop offset="100%" stopColor={chartTheme.lineColor} stopOpacity={0.7} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  horizontal
                  vertical={false}
                  stroke={chartTheme.textColor}
                  strokeOpacity={0.2}
                  strokeDasharray="2 4"
                />

                <XAxis
                  dataKey="name"
                  axisLine={{ stroke: chartTheme.textColor, strokeOpacity: 0.3 }}
                  tickLine={false}
                  tick={{ fill: chartTheme.textColor, fontSize: 11, fontFamily: "monospace" }}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartTheme.textColor, fontSize: 11, fontFamily: "monospace" }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartTheme.lineColor, fontSize: 11, fontFamily: "monospace" }}
                />

                <Legend
                  wrapperStyle={{ fontFamily: "monospace", fontSize: "12px" }}
                  payload={[
                    { value: t("sale.sold"), type: "square", color: chartTheme.downColor },
                    { value: t("sale.remaining"), type: "square", color: chartTheme.upColor },
                    { value: t("sale.price_eth"), type: "line", color: chartTheme.lineColor },
                  ]}
                />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border-2 border-border p-3 shadow-[4px_4px_0_var(--border)] font-mono text-xs">
                        <div className="text-muted-foreground mb-2 font-bold">{label}</div>
                        <div className="font-bold text-destructive mb-1">
                          {t("sale.sold_colon")} {d.sold.toFixed(4)} {symbol}
                        </div>
                        <div className="font-bold text-warning mb-1">
                          {t("sale.remaining_colon")} {d.remaining.toFixed(4)} {symbol}
                        </div>
                        <div className="font-bold text-primary mb-1">
                          {t("sale.price_colon")} {d.price.toFixed(4)} ETH
                        </div>
                        <div className="font-bold text-sm text-muted-foreground mb-1">
                          {((100 * d.sold) / (d.sold + d.remaining)).toFixed(1)}
                          {t("sale.percent_sold")}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-1">
                          {t("sale.deadline")} {d.deadline}
                        </div>
                      </div>
                    );
                  }}
                />

                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="priceNum"
                  fill="url(#priceGradient)"
                  fillOpacity={0.15}
                  stroke="none"
                />
                <Bar
                  yAxisId="left"
                  dataKey="sold"
                  stackId="a"
                  fill="url(#soldGradient)"
                  radius={[6, 0, 0, 6]}
                  barSize={50}
                />
                <Bar
                  yAxisId="left"
                  dataKey="remaining"
                  stackId="a"
                  fill="url(#remainingGradient)"
                  radius={[0, 6, 6, 0]}
                  barSize={50}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="priceNum"
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: chartTheme.lineColor, stroke: chartTheme.background, strokeWidth: 2 }}
                  activeDot={{ r: 6, fill: chartTheme.lineColor }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* spend/buy toggle */}
        <div className="flex gap-2 mb-6">
          <Button variant={mode === "ETH" ? "default" : "outline"} onClick={() => setMode("ETH")} className="flex-1">
            {t("sale.spend_eth")}
          </Button>
          <Button
            variant={mode === "TOKEN" ? "default" : "outline"}
            onClick={() => setMode("TOKEN")}
            className="flex-1"
          >
            {t("sale.buy_tokens")}
          </Button>
        </div>

        {/* tranche selector */}
        <h3 className="font-mono text-lg font-bold mb-2">{t("sale.choose_tranche")}</h3>
        <p className="font-mono text-sm text-muted-foreground mb-4">
          {t("sale.sequential_filling_note", "Only the cheapest available tranche can be purchased")}
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {activeTranches.map((tranche: Tranche) => {
            const isChosen = selected === tranche.trancheIndex;
            const isSelectable = isTrancheSelectable(tranche);
            const isDisabled = !isSelectable;

            return (
              <button
                key={tranche.trancheIndex}
                onClick={() => isSelectable && setSelected(tranche.trancheIndex)}
                disabled={isDisabled}
                className={cn(
                  "p-4 border-2 font-mono text-left transition-all shadow-[4px_4px_0_var(--border)]",
                  isDisabled
                    ? "bg-muted text-muted-foreground border-muted cursor-not-allowed opacity-60"
                    : cn(
                        "bg-card border-border hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_var(--border)]",
                        "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
                        isChosen &&
                          "bg-primary text-primary-foreground border-primary shadow-[4px_4px_0_var(--primary)]",
                      ),
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold">
                    {t("sale.tranche")} {tranche.trancheIndex}
                  </div>
                  {isSelectable && (
                    <div className="text-xs bg-green-500 text-white px-2 py-1 rounded font-bold">AVAILABLE</div>
                  )}
                  {isDisabled && (
                    <div className="text-xs bg-gray-400 text-white px-2 py-1 rounded font-bold">LOCKED</div>
                  )}
                </div>
                <div className="text-sm mb-1">
                  {t("sale.price")} {formatEther(BigInt(tranche.price))} ETH
                </div>
                <div className="text-sm mb-1">
                  {t("sale.remaining_colon")}{" "}
                  {remainderCoins !== null ? formatEther(remainderCoins) : formatEther(BigInt(tranche.remaining))}{" "}
                  {symbol}
                </div>
                <div className="text-xs text-muted-foreground">
                  ETH needed: {remainderWei !== null ? formatEther(remainderWei) : "..."} ETH
                </div>
              </button>
            );
          })}
        </div>

        {/* input & buttons */}
        {tranche && (
          <Card className="p-4">
            <label className="block text-sm font-mono font-bold mb-3">
              {mode === "ETH"
                ? t("sale.enter_eth_spend", { trancheIndex: tranche.trancheIndex })
                : t("sale.enter_token_amount", { symbol })}
            </label>

            <div className="flex gap-2 mb-4">
              <Input
                type="number"
                min="0"
                step={mode === "ETH" ? "0.0001" : "1"}
                placeholder="0.0"
                value={mode === "ETH" ? ethInput : tokenInput}
                onChange={(e) => (mode === "ETH" ? setEthInput(e.target.value) : setTokenInput(e.target.value))}
                className="flex-1"
              />
              <Button onClick={handleMax} size="sm" variant="outline">
                {t("sale.max")}
              </Button>
            </div>

            {/* live estimate */}
            <div className="text-sm font-mono mb-4 p-2 bg-muted border border-border">
              {mode === "ETH" ? (
                estimateTokens ? (
                  <div>
                    ≈{" "}
                    <span className="font-bold text-primary">{Number.parseFloat(estimateTokens).toLocaleString()}</span>{" "}
                    {symbol}
                    {/* Show if amount was rounded */}
                    {ethInput && parseEther(ethInput.trim() || "0") !== purchaseCalculations.validEthAmount && (
                      <div className="text-xs text-orange-600 mt-1">
                        Amount rounded to {formatEther(purchaseCalculations.validEthAmount)} ETH for exact ratio
                      </div>
                    )}
                  </div>
                ) : (
                  t("sale.estimate_placeholder")
                )
              ) : estimateEth ? (
                <div>
                  ≈ <span className="font-bold text-primary">{Number.parseFloat(estimateEth).toLocaleString()}</span>{" "}
                  ETH
                  {!purchaseCalculations.canPurchase && (
                    <div className="text-xs text-red-600 mt-1">
                      Cannot purchase exact amount - try a different quantity
                    </div>
                  )}
                </div>
              ) : (
                t("sale.estimate_placeholder")
              )}
            </div>

            {/* buy button */}
            <Button
              className="w-full mb-3"
              size="lg"
              disabled={!purchaseCalculations.canPurchase}
              onClick={() => {
                if (!tranche || !purchaseCalculations.canPurchase) return;

                if (mode === "ETH") {
                  // Use regular buy function with exact ETH amount
                  writeContract({
                    address: ZAMMLaunchAddress,
                    abi: ZAMMLaunchAbi,
                    functionName: "buy",
                    args: [coinId, BigInt(tranche.trancheIndex)],
                    value: purchaseCalculations.validEthAmount,
                  });
                } else {
                  // Use buyExactCoins function for exact coin purchase
                  // Ensure shares fit in uint96 (contract requirement)
                  const maxUint96 = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFF"); // 2^96 - 1
                  if (purchaseCalculations.validCoinAmount > maxUint96) {
                    console.error("Coin amount too large for uint96");
                    return;
                  }

                  writeContract({
                    address: ZAMMLaunchAddress,
                    abi: ZAMMLaunchAbi,
                    functionName: "buyExactCoins",
                    args: [coinId, BigInt(tranche.trancheIndex), purchaseCalculations.validCoinAmount],
                    value: purchaseCalculations.ethCost,
                  });
                }
                onTxSent();
              }}
            >
              {t("sale.buy")}&nbsp;
              {mode === "ETH"
                ? `${formatEther(purchaseCalculations.validEthAmount)} ETH`
                : `${formatEther(purchaseCalculations.validCoinAmount)} ${symbol}`}
            </Button>

            {/* dust sweep */}
            {sweepable && (
              <Button
                variant="secondary"
                className="w-full"
                size="lg"
                onClick={() => {
                  if (!tranche || remainderWei === null) return;
                  writeContract({
                    address: ZAMMLaunchAddress,
                    abi: ZAMMLaunchAbi,
                    functionName: "buy",
                    args: [coinId, BigInt(tranche.trancheIndex)],
                    value: remainderWei,
                  });
                  onTxSent();
                }}
              >
                {t("sale.sweep_tranche")} ({formatEther(remainderWei!)} ETH)
              </Button>
            )}
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
