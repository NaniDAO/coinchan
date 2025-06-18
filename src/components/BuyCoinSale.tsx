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
import {
  useWriteContract,
  usePublicClient,
  useAccount,
  useBalance,
} from "wagmi";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatEther, parseEther } from "viem";
import { Badge } from "./ui/badge";
import { PillIndicator } from "./ui/pill";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "./ui/card";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import { useCoinSale } from "@/hooks/use-coin-sale";
import { BuySellCookbookCoin } from "./BuySellCookbookCoin";
import { useChartTheme } from "@/hooks/use-chart-theme";

/* ───────── helpers ───────── */

const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
};

const statusToPillVariant = (s: string) =>
  s === "ACTIVE" ? "success" : s === "FINALIZED" ? "info" : "error";

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
}: {
  coinId: bigint;
  symbol: string;
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

  /* dust-helper */
  const [Pstar, setPstar] = useState<bigint>(0n);
  const [Cstar, setCstar] = useState<bigint>(0n);
  const [remainderWei, setRemainderWei] = useState<bigint | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  
  /* real-time tranche remaining amounts from blockchain */
  const [trancheRemainingWei, setTrancheRemainingWei] = useState<Map<number, bigint>>(new Map());

  /* get cheapest available tranche (use real-time blockchain data) */
  const cheapestAvailableTranche = useMemo(() => {
    if (!sale) return null;
    const active = sale.tranches.items.filter((t: Tranche) => isTrancheSelectable(t));
    if (!active.length) return null;
    
    // Sort by price and return the cheapest available tranche
    return active.reduce((cheapest: Tranche, current: Tranche) =>
      BigInt(cheapest.price) < BigInt(current.price) ? cheapest : current,
    );
  }, [sale, trancheRemainingWei]);

  /* auto-select cheapest available tranche */
  useEffect(() => {
    if (cheapestAvailableTranche) {
      setSelected(cheapestAvailableTranche.trancheIndex);
    }
  }, [cheapestAvailableTranche]);

  const tranche: Tranche | undefined = useMemo(
    () =>
      sale?.tranches.items.find((t: Tranche) => t.trancheIndex === selected),
    [sale, selected],
  );

  /* check if a tranche is selectable (use real-time blockchain data) */
  const isTrancheSelectable = useCallback((trancheToCheck: Tranche) => {
    // Check deadline first (from indexer data)
    if (Number(trancheToCheck.deadline) * 1000 <= Date.now()) {
      return false;
    }
    
    // Use real-time blockchain data for remaining amount
    const realTimeRemaining = trancheRemainingWei.get(trancheToCheck.trancheIndex);
    if (realTimeRemaining !== undefined) {
      return realTimeRemaining > 0n;
    }
    
    // Fallback to indexer data if blockchain data not yet loaded
    return BigInt(trancheToCheck.remaining) > 0n;
  }, [trancheRemainingWei]);

  /* compute atomic lot when tranche changes */
  useEffect(() => {
    if (!tranche) {
      setPstar(0n);
      setCstar(0n);
      return;
    }
    const priceWei = BigInt(tranche.price);
    const coinsWei = BigInt(tranche.coins);
    const g = gcd(priceWei, coinsWei);
    setPstar(priceWei / g);
    setCstar(coinsWei / g);
  }, [tranche]);

  /* refresh remainderWei after each tx */
  useEffect(() => {
    (async () => {
      if (!tranche) {
        setRemainderWei(null);
        return;
      }
      const rem = (await publicClient?.readContract({
        address: ZAMMLaunchAddress,
        abi: ZAMMLaunchAbi,
        functionName: "trancheRemainingWei",
        args: [coinId, BigInt(tranche.trancheIndex)],
      })) as bigint;
      setRemainderWei(rem);
    })();
  }, [tranche, refreshKey, publicClient, coinId]);

  /* refresh real-time remaining amounts for all tranches */
  useEffect(() => {
    (async () => {
      if (!sale || !publicClient) {
        setTrancheRemainingWei(new Map());
        return;
      }
      
      const remainingMap = new Map<number, bigint>();
      
      // Fetch remaining amounts for all tranches in parallel
      const promises = sale.tranches.items.map(async (t: Tranche) => {
        try {
          const remaining = (await publicClient.readContract({
            address: ZAMMLaunchAddress,
            abi: ZAMMLaunchAbi,
            functionName: "trancheRemainingWei",
            args: [coinId, BigInt(t.trancheIndex)],
          })) as bigint;
          remainingMap.set(t.trancheIndex, remaining);
        } catch (error) {
          console.warn(`Failed to fetch remaining for tranche ${t.trancheIndex}:`, error);
          remainingMap.set(t.trancheIndex, 0n);
        }
      });
      
      await Promise.all(promises);
      setTrancheRemainingWei(remainingMap);
    })();
  }, [sale, refreshKey, publicClient, coinId]);

  const lotsFromEth = (rawWei: bigint) => (Pstar === 0n ? 0n : rawWei / Pstar);
  const lotsFromToken = (rawTok: bigint) =>
    Cstar === 0n ? 0n : rawTok / Cstar;

  /* sanitise ETH input */
  const sanitisedWei = useMemo(() => {
    if (mode !== "ETH" || Pstar === 0n) return 0n;
    try {
      const rawWei = ethInput.trim() ? parseEther(ethInput.trim()) : 0n;
      return (rawWei / Pstar) * Pstar; // round down to multiple of P*
    } catch {
      return 0n;
    }
  }, [ethInput, mode, Pstar]);

  /* sanitise TOKEN input & derive ETH required */
  const { tokenWeiRounded, ethWeiForTokens } = useMemo(() => {
    if (mode !== "TOKEN" || Cstar === 0n || Pstar === 0n) {
      return { tokenWeiRounded: 0n, ethWeiForTokens: 0n };
    }
    try {
      const rawTokWei = tokenInput.trim() ? parseEther(tokenInput.trim()) : 0n;
      const lots = lotsFromToken(rawTokWei); // floor
      const tokWei = lots * Cstar;
      const ethWei = lots * Pstar;
      return { tokenWeiRounded: tokWei, ethWeiForTokens: ethWei };
    } catch {
      return { tokenWeiRounded: 0n, ethWeiForTokens: 0n };
    }
  }, [tokenInput, mode, Cstar, Pstar]);

  /* estimates */
  const estimateTokens = useMemo(() => {
    if (mode !== "ETH" || sanitisedWei === 0n || !tranche) return undefined;
    const tokensWei = lotsFromEth(sanitisedWei) * Cstar;
    return formatEther(tokensWei);
  }, [mode, sanitisedWei, tranche, Cstar]);

  const estimateEth = useMemo(() => {
    if (mode !== "TOKEN" || tokenWeiRounded === 0n) return undefined;
    return formatEther(ethWeiForTokens);
  }, [mode, tokenWeiRounded, ethWeiForTokens]);

  /* sweep eligibility */
  const sweepable =
    remainderWei !== null &&
    Pstar !== 0n &&
    remainderWei % Pstar === 0n &&
    remainderWei > 0n;

  const onTxSent = () => setRefreshKey((k) => k + 1);

  /* handle MAX */
  const handleMax = () => {
    if (!tranche) return;
    if (mode === "ETH") {
      if (balanceData?.value) setEthInput(formatEther(balanceData.value));
    } else {
      // Use real-time blockchain data if available, otherwise fall back to indexer data
      const realTimeRemainingWei = trancheRemainingWei.get(tranche.trancheIndex);
      let remainingTokWei: bigint;
      
      if (realTimeRemainingWei !== undefined) {
        // Calculate remaining tokens from remaining wei
        const tranchePriceWei = BigInt(tranche.price);
        const trancheCoinsWei = BigInt(tranche.coins);
        if (tranchePriceWei > 0n) {
          remainingTokWei = (realTimeRemainingWei * trancheCoinsWei) / tranchePriceWei;
        } else {
          remainingTokWei = BigInt(tranche.remaining);
        }
      } else {
        remainingTokWei = BigInt(tranche.remaining);
      }
      
      const lots = lotsFromToken(remainingTokWei);
      setTokenInput(formatEther(lots * Cstar));
    }
  };

  /* early exits */
  if (isLoading) return <div>{t("sale.loading")}</div>;
  if (!sale) return <div>{t("sale.not_found")}</div>;
  if (sale.status === "FINALIZED")
    return <BuySellCookbookCoin coinId={coinId} symbol={symbol} />;

  const activeTranches = sale.tranches.items.filter((t: Tranche) => isTrancheSelectable(t))
    .sort((a: Tranche, b: Tranche) => {
      // Sort by price ascending for consistent ordering
      const priceA = BigInt(a.price);
      const priceB = BigInt(b.price);
      return priceA < priceB ? -1 : priceA > priceB ? 1 : 0;
    });

  /* chart data */
  const chartData = useMemo(() => sale.tranches.items.map((t: Tranche) => {
    // Use real-time blockchain data if available
    const realTimeRemainingWei = trancheRemainingWei.get(t.trancheIndex);
    let remainingTokens: bigint;
    let soldTokens: bigint;
    
    if (realTimeRemainingWei !== undefined) {
      // Calculate remaining tokens from remaining wei
      const tranchePriceWei = BigInt(t.price);
      const trancheCoinsWei = BigInt(t.coins);
      if (tranchePriceWei > 0n) {
        remainingTokens = (realTimeRemainingWei * trancheCoinsWei) / tranchePriceWei;
        soldTokens = trancheCoinsWei - remainingTokens;
      } else {
        remainingTokens = BigInt(t.remaining);
        soldTokens = BigInt(t.sold);
      }
    } else {
      // Fallback to indexer data
      remainingTokens = BigInt(t.remaining);
      soldTokens = BigInt(t.sold);
    }
    
    return {
      name: `Tranche ${t.trancheIndex}`,
      sold: Number(formatEther(soldTokens)),
      remaining: Number(formatEther(remainingTokens)),
      price: Number(formatEther(BigInt(t.price))),
      priceNum: Number(formatEther(BigInt(t.price))),
      deadline: new Date(Number(t.deadline) * 1000).toLocaleString(),
      trancheIndex: t.trancheIndex,
      isSelected: t.trancheIndex === selected,
    };
  }), [sale.tranches.items, trancheRemainingWei, selected]);

  /* chart theme */
  const chartTheme = useChartTheme();

  /* ─────────────────────────── JSX ─────────────────────────── */

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="font-mono text-xl">{t('sale.title')}</CardTitle>
        <CardAction>
          <Badge variant="outline" className="font-mono">
            <PillIndicator variant={statusToPillVariant(sale.status)} pulse />
            <span className="ml-1">{sale.status}</span>
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="font-mono text-sm mb-6">
          {t('sale.supply')} {formatEther(BigInt(sale.saleSupply))} {symbol}
        </div>
        
        <h3 className="font-mono text-lg font-bold mb-4">{t('sale.tranches')}</h3>
        <Card className="p-4 mb-6">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
              >
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

                <CartesianGrid horizontal vertical={false} stroke={chartTheme.textColor} strokeOpacity={0.2} strokeDasharray="2 4" />

                <XAxis dataKey="name" axisLine={{ stroke: chartTheme.textColor, strokeOpacity: 0.3 }} tickLine={false} tick={{ fill: chartTheme.textColor, fontSize: 11, fontFamily: 'monospace' }} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: chartTheme.textColor, fontSize: 11, fontFamily: 'monospace' }} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: chartTheme.lineColor, fontSize: 11, fontFamily: 'monospace' }} />

                <Legend
                  wrapperStyle={{ fontFamily: 'monospace', fontSize: '12px' }}
                  payload={[
                    { value: t('sale.sold'), type: "square", color: chartTheme.downColor },
                    { value: t('sale.remaining'), type: "square", color: chartTheme.upColor },
                    { value: t('sale.price_eth'), type: "line",  color: chartTheme.lineColor },
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
                          {t('sale.sold_colon')} {d.sold.toFixed(4)} {symbol}
                        </div>
                        <div className="font-bold text-warning mb-1">
                          {t('sale.remaining_colon')} {d.remaining.toFixed(4)} {symbol}
                        </div>
                        <div className="font-bold text-primary mb-1">
                          {t('sale.price_colon')} {d.price.toFixed(4)} ETH
                        </div>
                        <div className="font-bold text-sm text-muted-foreground mb-1">
                          {((100 * d.sold) / (d.sold + d.remaining)).toFixed(1)}{t('sale.percent_sold')}
                        </div>
                        <div className="text-xs text-muted-foreground mt-2 border-t border-border pt-1">{t('sale.deadline')} {d.deadline}</div>
                      </div>
                    );
                  }}
                />

                <Area yAxisId="right" type="monotone" dataKey="priceNum" fill="url(#priceGradient)" fillOpacity={0.15} stroke="none" />
                <Bar yAxisId="left" dataKey="sold"      stackId="a" fill="url(#soldGradient)"      radius={[6,0,0,6]} barSize={50} />
                <Bar yAxisId="left" dataKey="remaining" stackId="a" fill="url(#remainingGradient)" radius={[0,6,6,0]} barSize={50} />
                <Line yAxisId="right" type="monotone" dataKey="priceNum" stroke="url(#lineGradient)" strokeWidth={3}
                      dot={{ r:4, fill: chartTheme.lineColor, stroke: chartTheme.background, strokeWidth:2 }} activeDot={{ r:6, fill: chartTheme.lineColor }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        
        {/* spend/buy toggle */}
        <div className="flex gap-2 mb-6">
          <Button 
            variant={mode === "ETH" ? "default" : "outline"}
            onClick={() => setMode("ETH")}
            className="flex-1"
          >
            {t('sale.spend_eth')}
          </Button>
          <Button 
            variant={mode === "TOKEN" ? "default" : "outline"}
            onClick={() => setMode("TOKEN")}
            className="flex-1"
          >
            {t('sale.buy_tokens')}
          </Button>
        </div>

        {/* tranche selector */}
        <h3 className="font-mono text-lg font-bold mb-2">{t('sale.choose_tranche')}</h3>
        <p className="font-mono text-sm text-muted-foreground mb-4">
          {t('sale.available_tranches_note', 'You can purchase from any available tranche')}
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
                        isChosen && "bg-primary text-primary-foreground border-primary shadow-[4px_4px_0_var(--primary)]"
                      )
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold">{t('sale.tranche')} {tranche.trancheIndex}</div>
                  {isSelectable && <div className="text-xs bg-green-500 text-white px-2 py-1 rounded font-bold">AVAILABLE</div>}
                  {isDisabled && <div className="text-xs bg-gray-400 text-white px-2 py-1 rounded font-bold">LOCKED</div>}
                </div>
                <div className="text-sm mb-1">{t('sale.price')} {formatEther(BigInt(tranche.price))} ETH</div>
                <div className="text-sm">
                  {t('sale.remaining_colon')} {
                    (() => {
                      // Use real-time blockchain data if available
                      const realTimeRemainingWei = trancheRemainingWei.get(tranche.trancheIndex);
                      if (realTimeRemainingWei !== undefined) {
                        const tranchePriceWei = BigInt(tranche.price);
                        const trancheCoinsWei = BigInt(tranche.coins);
                        if (tranchePriceWei > 0n) {
                          const remainingTokens = (realTimeRemainingWei * trancheCoinsWei) / tranchePriceWei;
                          return formatEther(remainingTokens);
                        }
                      }
                      // Fallback to indexer data
                      return formatEther(BigInt(tranche.remaining));
                    })()
                  } {symbol}
                </div>
              </button>
            );
          })}
        </div>

        {/* input & buttons */}
        {tranche && (
          <Card className="p-4">
            <label className="block text-sm font-mono font-bold mb-3">
              {mode==="ETH"
                ? t('sale.enter_eth_spend', { trancheIndex: tranche.trancheIndex })
                : t('sale.enter_token_amount', { symbol })}
            </label>

            <div className="flex gap-2 mb-4">
              <Input
                type="number"
                min="0"
                step={mode==="ETH" ? "0.0001" : "1"}
                placeholder="0.0"
                value={mode==="ETH" ? ethInput : tokenInput}
                onChange={(e) => mode==="ETH" ? setEthInput(e.target.value) : setTokenInput(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleMax} size="sm" variant="outline">
                {t('sale.max')}
              </Button>
            </div>

            {/* live estimate */}
            <div className="text-sm font-mono mb-4 p-2 bg-muted border border-border">
              {mode==="ETH"
                ? estimateTokens
                    ? <>≈ <span className="font-bold text-primary">{parseFloat(estimateTokens).toLocaleString()}</span> {symbol}</>
                    : t('sale.estimate_placeholder')
                : estimateEth
                    ? <>≈ <span className="font-bold text-primary">{parseFloat(estimateEth).toLocaleString()}</span> ETH</>
                    : t('sale.estimate_placeholder')}
            </div>

            {/* buy button */}
            <Button
              className="w-full mb-3"
              size="lg"
              disabled={
                mode==="ETH"   ? sanitisedWei===0n
                               : tokenWeiRounded===0n || ethWeiForTokens===0n
              }
              onClick={() => {
                if (!tranche) return;
                const valueWei = mode==="ETH" ? sanitisedWei : ethWeiForTokens;
                writeContract({
                  address: ZAMMLaunchAddress,
                  abi: ZAMMLaunchAbi,
                  functionName: "buy",
                  args: [coinId, BigInt(tranche.trancheIndex)],
                  value: valueWei,
                });
                onTxSent();
              }}
            >
              {t('sale.buy')}&nbsp;
              {mode==="ETH"
                ? `${formatEther(sanitisedWei || 0n)} ETH`
                : `${formatEther(tokenWeiRounded || 0n)} ${symbol}`}
            </Button>

            {/* dust sweep */}
            {sweepable && (
              <Button
                variant="secondary"
                className="w-full"
                size="lg"
                onClick={() => {
                  if (!tranche || remainderWei===null) return;
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
                {t('sale.sweep_tranche')} ({formatEther(remainderWei!)} ETH)
              </Button>
            )}
          </Card>
        )}
      </CardContent>
    </Card>
  );
};
