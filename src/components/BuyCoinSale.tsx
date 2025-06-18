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
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";
import { twMerge } from "tailwind-merge";
import { useCoinSale } from "@/hooks/use-coin-sale";
import { BuySellCookbookCoin } from "./BuySellCookbookCoin";

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

  /* pick cheapest tranche as default */
  useEffect(() => {
    if (!sale) return;
    const active = sale.tranches.items.filter(
      (t: Tranche) =>
        BigInt(t.remaining) > 0n && Number(t.deadline) * 1000 > Date.now(),
    );
    if (active.length) {
      const cheapest = active.reduce((p: Tranche, c: Tranche) =>
        BigInt(p.price) < BigInt(c.price) ? p : c,
      );
      setSelected(cheapest.trancheIndex);
    }
  }, [sale]);

  const tranche: Tranche | undefined = useMemo(
    () =>
      sale?.tranches.items.find((t: Tranche) => t.trancheIndex === selected),
    [sale, selected],
  );

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
      const remainingTokWei = BigInt(tranche.remaining);
      const lots = lotsFromToken(remainingTokWei);
      setTokenInput(formatEther(lots * Cstar));
    }
  };

  /* early exits */
  if (isLoading) return <div>{t("sale.loading")}</div>;
  if (!sale) return <div>{t("sale.not_found")}</div>;
  if (sale.status === "FINALIZED")
    return <BuySellCookbookCoin coinId={coinId} symbol={symbol} />;

  const activeTranches = sale.tranches.items.filter(
    (t: Tranche) =>
      BigInt(t.remaining) > 0n && Number(t.deadline) * 1000 > Date.now(),
  );

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

  /* ─────────────────────────── JSX ─────────────────────────── */

  return (
    <div className="border-2 border-secondary">
      {/* header */}
      <div className="flex justify-between items-center p-2 border-b border-secondary">
        <h2 className="text-xl font-bold">{t("sale.title")}</h2>
        <Badge variant="outline">
          <PillIndicator variant={statusToPillVariant(sale.status)} pulse />
          <span className="ml-1">{sale.status}</span>
        </Badge>
      </div>

      {/* stats & chart */}
      <div className="p-2">
        <div>
          {t("sale.supply")} {formatEther(BigInt(sale.saleSupply))} {symbol}
        </div>
        <h3 className="text-lg font-semibold mt-4 mb-2">
          {t("sale.tranches")}
        </h3>
        <div className="bg-sidebar rounded-2xl shadow-sm p-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
              >
                {/* … same svg gradients, axes, tooltip, bars & line as previous version … */}
                <defs>
                  <linearGradient id="soldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient
                    id="remainingGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#facc15" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#facc15" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient
                    id="priceGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#00e5ff" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00e5ff" />
                    <stop offset="100%" stopColor="#4dd0e1" />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  horizontal
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeDasharray="1 4"
                />

                <XAxis
                  dataKey="name"
                  axisLine={{ stroke: "#cbd5e0" }}
                  tickLine={false}
                  tick={{ fill: "#4a5568", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#4a5568", fontSize: 12 }}
                />

                <Legend
                  payload={[
                    { value: t("sale.sold"), type: "square", color: "#ef4444" },
                    {
                      value: t("sale.remaining"),
                      type: "square",
                      color: "#facc15",
                    },
                    {
                      value: t("sale.price_eth"),
                      type: "line",
                      color: "#00e5ff",
                    },
                  ]}
                />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white p-2 rounded shadow-lg text-sm">
                        <div className="text-gray-600 mb-1">{label}</div>
                        <div className="font-medium text-red-500">
                          {t("sale.sold_colon")} {d.sold.toFixed(4)} {symbol}
                        </div>
                        <div className="font-medium text-yellow-500">
                          {t("sale.remaining_colon")} {d.remaining.toFixed(4)}{" "}
                          {symbol}
                        </div>
                        <div className="font-medium text-blue-500">
                          {t("sale.price_colon")} {d.price.toFixed(4)} ETH
                        </div>
                        <div className="font-medium text-sm text-gray-600">
                          {((100 * d.sold) / (d.sold + d.remaining)).toFixed(1)}
                          {t("sale.percent_sold")}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {t("sale.deadline")} {d.deadline}
                        </div>
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="priceNum"
                  fill="url(#priceGradient)"
                  fillOpacity={0.15}
                  stroke="none"
                />
                <Bar
                  dataKey="sold"
                  stackId="a"
                  fill="url(#soldGradient)"
                  radius={[6, 0, 0, 6]}
                  barSize={50}
                />
                <Bar
                  dataKey="remaining"
                  stackId="a"
                  fill="url(#remainingGradient)"
                  radius={[0, 6, 6, 0]}
                  barSize={50}
                />
                <Line
                  type="monotone"
                  dataKey="priceNum"
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  dot={{
                    r: 4,
                    fill: "#00e5ff",
                    stroke: "#fff",
                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 6 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* spend/buy toggle */}
      <div className="flex space-x-2 px-2 mt-4">
        <button
          onClick={() => setMode("ETH")}
          className={twMerge(
            "px-4 py-2 rounded-lg",
            mode === "ETH" ? "bg-accent text-white" : "bg-sidebar",
          )}
        >
          {t("sale.spend_eth")}
        </button>
        <button
          onClick={() => setMode("TOKEN")}
          className={twMerge(
            "px-4 py-2 rounded-lg",
            mode === "TOKEN" ? "bg-accent text-white" : "bg-sidebar",
          )}
        >
          {t("sale.buy_tokens")}
        </button>
      </div>

      {/* tranche selector */}
      <h3 className="text-lg font-semibold mt-4 mb-2 px-2">
        {t("sale.choose_tranche")}
      </h3>
      <div className="grid sm:grid-cols-2 gap-3 px-2">
        {activeTranches.map((tranche: Tranche) => {
          const isChosen = selected === tranche.trancheIndex;
          return (
            <button
              key={tranche.trancheIndex}
              onClick={() => setSelected(tranche.trancheIndex)}
              className={twMerge(
                "p-4 rounded-2xl bg-sidebar border transition",
                isChosen
                  ? "border-accent shadow-[0_0_12px_var(--tw-shadow-color)] shadow-accent/70"
                  : "border-secondary hover:border-accent/60",
              )}
            >
              <div className="font-semibold mb-1">
                {t("sale.tranche")} {tranche.trancheIndex}
              </div>
              <div className="text-sm">
                {t("sale.price")} {formatEther(BigInt(tranche.price))} ETH
              </div>
              <div className="text-sm">
                {t("sale.remaining_colon")}{" "}
                {formatEther(BigInt(tranche.remaining))} {symbol}
              </div>
            </button>
          );
        })}
      </div>

      {/* input & buttons */}
      {tranche && (
        <div className="mt-4 p-4 bg-sidebar rounded-2xl shadow-sm mx-2 mb-2">
          <label className="block text-sm font-medium mb-1">
            {mode === "ETH"
              ? t("sale.enter_eth_spend", {
                  trancheIndex: tranche.trancheIndex,
                })
              : t("sale.enter_token_amount", { symbol })}
          </label>

          <div className="flex items-center mb-3">
            <Input
              type="number"
              min="0"
              step={mode === "ETH" ? "0.0001" : "1"}
              placeholder="0.0"
              value={mode === "ETH" ? ethInput : tokenInput}
              onChange={(e) =>
                mode === "ETH"
                  ? setEthInput(e.target.value)
                  : setTokenInput(e.target.value)
              }
            />
            <button
              onClick={handleMax}
              className="ml-2 px-3 py-1 text-sm font-medium bg-sidebar rounded"
            >
              {t("sale.max")}
            </button>
          </div>

          {/* live estimate */}
          <div className="text-sm mb-4">
            {mode === "ETH" ? (
              estimateTokens ? (
                <>
                  ≈{" "}
                  <span className="font-semibold">
                    {parseFloat(estimateTokens).toLocaleString()}
                  </span>{" "}
                  {symbol}
                </>
              ) : (
                t("sale.estimate_placeholder")
              )
            ) : estimateEth ? (
              <>
                ≈{" "}
                <span className="font-semibold">
                  {parseFloat(estimateEth).toLocaleString()}
                </span>{" "}
                ETH
              </>
            ) : (
              t("sale.estimate_placeholder")
            )}
          </div>

          {/* buy button */}
          <Button
            className="w-full mb-2"
            disabled={
              mode === "ETH"
                ? sanitisedWei === 0n
                : tokenWeiRounded === 0n || ethWeiForTokens === 0n
            }
            onClick={() => {
              if (!tranche) return;
              const valueWei = mode === "ETH" ? sanitisedWei : ethWeiForTokens;
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
            {t("sale.buy")}&nbsp;
            {mode === "ETH"
              ? `${formatEther(sanitisedWei || 0n)} ETH`
              : `${formatEther(tokenWeiRounded || 0n)} ${symbol}`}
          </Button>

          {/* dust sweep */}
          {sweepable && (
            <Button
              variant="secondary"
              className="w-full"
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
        </div>
      )}
    </div>
  );
};
