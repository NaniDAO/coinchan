/*  BuyCoinSale.ts
    —————————————————————————————————————————————————————————————————
    • Rounds every msg.value to the tranche’s irreducible lot P*,
      preventing creation of unfillable dust.
    • Shows a “Sweep dust” button only when the remainder is already a
      clean multiple of P*, so the click is guaranteed to succeed.
   ------------------------------------------------------------------ */

import {
  ZAMMLaunchAbi,
  ZAMMLaunchAddress,
} from "@/constants/ZAMMLaunch";
import { useWriteContract, usePublicClient } from "wagmi";
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
import { Input } from "./ui/input";
import { twMerge } from "tailwind-merge";
import { useCoinSale } from "@/hooks/use-coin-sale";
import { BuySellCookbookCoin } from "./BuySellCookbookCoin";

/* ───────────────────────────────────────────────────────────── */

interface Tranche {
  coins: string;
  deadline: string;
  price: string;
  remaining: string;
  trancheIndex: number;
  sold: string;
}

const statusToPillVariant = (status: string) => {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "FINALIZED":
      return "info";
    case "EXPIRED":
      return "error";
    default:
      return "info";
  }
};

/* bigint gcd */
const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== 0n) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
};

/* ───────────────────────────────────────────────────────────── */

export const BuyCoinSale = ({
  coinId,
  symbol,
}: {
  coinId: bigint;
  symbol: string;
}) => {
  const { data: sale, isLoading } = useCoinSale({
    coinId: coinId.toString(),
  });
  const { writeContract } = useWriteContract();
  const publicClient = usePublicClient();

  const [selected, setSelected] = useState<number | null>(null);
  const [ethInput, setEthInput] = useState<string>("");
  const [sanitisedWei, setSanitisedWei] = useState<bigint>(0n);

  const [remainderWei, setRemainderWei] = useState<bigint | null>(null);
  const [pStar, setPStar] = useState<bigint>(0n);
  const [refreshKey, setRefreshKey] = useState(0); // bump after each tx to refresh remainder

  /* pick cheapest active tranche by default */
  useEffect(() => {
    if (!sale) return;
    const actives = sale.tranches.items.filter(
      (t: Tranche) =>
        BigInt(t.remaining) > 0n &&
        Number(t.deadline) * 1000 > Date.now(),
    );
    if (actives.length) {
      const cheapest = actives.reduce((p: Tranche, c: Tranche) =>
        BigInt(p.price) < BigInt(c.price) ? p : c,
      );
      setSelected(cheapest.trancheIndex);
    }
  }, [sale]);

  const chosenTranche: Tranche | undefined = useMemo(
    () => sale?.tranches.items.find((t: Tranche) => t.trancheIndex === selected),
    [sale, selected],
  );

  /* round input to multiple of P* */
  useEffect(() => {
    if (!chosenTranche) {
      setSanitisedWei(0n);
      setPStar(0n);
      return;
    }
    try {
      const priceWei = BigInt(chosenTranche.price);
      const coinsWei = BigInt(chosenTranche.coins);
      const P = priceWei / gcd(priceWei, coinsWei);
      setPStar(P);

      const rawWei = ethInput.trim() ? parseEther(ethInput.trim()) : 0n;
      setSanitisedWei((rawWei / P) * P);
    } catch {
      setSanitisedWei(0n);
      setPStar(0n);
    }
  }, [ethInput, chosenTranche]);

  /* fetch on-chain remainder whenever tranche changes or after tx */
  useEffect(() => {
    (async () => {
      if (!chosenTranche) {
        setRemainderWei(null);
        return;
      }
      try {
        const rem = (await publicClient.readContract({
          address: ZAMMLaunchAddress,
          abi: ZAMMLaunchAbi,
          functionName: "trancheRemainingWei",
          args: [coinId, BigInt(chosenTranche.trancheIndex)],
        })) as bigint;
        setRemainderWei(rem);
      } catch {
        setRemainderWei(null);
      }
    })();
  }, [chosenTranche, refreshKey, publicClient, coinId]);

  const estimate = useMemo(() => {
    if (!chosenTranche || sanitisedWei === 0n) return undefined;
    try {
      const priceWei = BigInt(chosenTranche.price);
      const coinsWei = BigInt(chosenTranche.coins);
      const coinsBoughtWei = (sanitisedWei * coinsWei) / priceWei;
      return Number(formatEther(coinsBoughtWei));
    } catch {
      return undefined;
    }
  }, [chosenTranche, sanitisedWei]);

  /* early exits */
  if (isLoading) return <div>Loading...</div>;
  if (!sale) return <div>Sale not found</div>;
  if (sale.status === "FINALIZED") return <BuySellCookbookCoin coinId={coinId} symbol={symbol} />;

  const activeTranches = sale.tranches.items.filter(
    (t: Tranche) =>
      BigInt(t.remaining) > 0n && Number(t.deadline) * 1000 > Date.now(),
  );

  /* sweep eligibility */
  const sweepable =
    remainderWei !== null && remainderWei > 0n && pStar !== 0n && remainderWei % pStar === 0n;

  const onTxSent = () => setRefreshKey((n) => n + 1);

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

  /* ───────────────────────────────────────────── JSX ───────────────────────────────────────────── */

  return (
    <div className="border-2 border-secondary">
      {/* header */}
      <div className="flex justify-between items-center p-2 border-b border-secondary">
        <h2 className="text-xl font-bold">Sale</h2>
        <Badge variant="outline">
          <PillIndicator variant={statusToPillVariant(sale.status)} pulse />
          <span className="ml-1">{sale.status}</span>
        </Badge>
      </div>

      {/* global stats & chart */}
      <div className="p-2">
        <div>
          Supply: {formatEther(BigInt(sale.saleSupply))} {symbol}
        </div>

        <h3 className="text-lg font-semibold mt-4 mb-2">Tranches</h3>

        <div className="bg-sidebar rounded-2xl shadow-sm p-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
              >
                <defs>
                  <linearGradient id="soldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="remainingGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#facc15" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#facc15" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#00e5ff" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00e5ff" />
                    <stop offset="100%" stopColor="#4dd0e1" />
                  </linearGradient>
                </defs>

                <CartesianGrid horizontal vertical={false} stroke="#e2e8f0" strokeDasharray="1 4" />

                <XAxis
                  dataKey="name"
                  axisLine={{ stroke: "#cbd5e0" }}
                  tickLine={false}
                  tick={{ fill: "#4a5568", fontSize: 12 }}
                />

                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#4a5568", fontSize: 12 }} />

                <Legend
                  payload={[
                    { value: "Sold", type: "square", color: "#ef4444" },
                    { value: "Remaining", type: "square", color: "#facc15" },
                    { value: "Price (ETH)", type: "line", color: "#00e5ff" },
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
                          Sold: {d.sold.toFixed(4)} {symbol}
                        </div>
                        <div className="font-medium text-yellow-500">
                          Remaining: {d.remaining.toFixed(4)} {symbol}
                        </div>
                        <div className="font-medium text-blue-500">
                          Price: {d.price.toFixed(4)} ETH
                        </div>
                        <div className="font-medium text-sm text-gray-600">
                          {((100 * d.sold) / (d.sold + d.remaining)).toFixed(1)}% Sold
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Deadline: {d.deadline}</div>
                      </div>
                    );
                  }}
                />

                <Area type="monotone" dataKey="priceNum" fill="url(#priceGradient)" fillOpacity={0.15} stroke="none" />

                <Bar
                  dataKey="sold"
                  stackId="a"
                  fill="url(#soldGradient)"
                  radius={[6, 0, 0, 6]}
                  name="Sold"
                  isAnimationActive
                  animationDuration={800}
                  barSize={50}
                  className="opacity-90"
                />
                <Bar
                  dataKey="remaining"
                  stackId="a"
                  fill="url(#remainingGradient)"
                  radius={[0, 6, 6, 0]}
                  name="Remaining"
                  isAnimationActive
                  animationDuration={800}
                  barSize={50}
                  className="opacity-90"
                />

                <Line
                  type="monotone"
                  dataKey="priceNum"
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  dot={{ r: 4, fill: "#00e5ff", stroke: "#fff", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  name="Price (ETH)"
                  isAnimationActive
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* tranche selector */}
      <h3 className="text-lg font-semibold mt-4 mb-2 px-2">Choose a tranche</h3>
      <div className="grid sm:grid-cols-2 gap-3 px-2">
        {activeTranches.map((t: Tranche) => {
          const isChosen = selected === t.trancheIndex;
          return (
            <button
              key={t.trancheIndex}
              onClick={() => setSelected(t.trancheIndex)}
              className={twMerge(
                "p-4 rounded-2xl bg-sidebar border transition",
                isChosen
                  ? "border-accent shadow-[0_0_12px_var(--tw-shadow-color)] shadow-accent/70"
                  : "border-secondary hover:border-accent/60",
              )}
            >
              <div className="font-semibold mb-1">Tranche {t.trancheIndex}</div>
              <div className="text-sm">Price: {formatEther(BigInt(t.price))} ETH</div>
              <div className="text-sm">
                Remaining: {formatEther(BigInt(t.remaining))} {symbol}
              </div>
            </button>
          );
        })}
      </div>

      {/* input & buttons */}
      {chosenTranche && (
        <div className="mt-4 p-4 bg-sidebar rounded-2xl shadow-sm mx-2 mb-2">
          <label className="block text-sm font-medium mb-1">
            Enter ETH to spend on Tranche {chosenTranche.trancheIndex}
          </label>

          <Input
            type="number"
            min="0"
            step="0.0001"
            placeholder="0.0"
            value={ethInput}
            onChange={(e) => setEthInput(e.target.value)}
            className="mb-3"
          />

          <div className="text-sm mb-4">
            {estimate !== undefined ? (
              <>
                ≈ <span className="font-semibold">{estimate.toLocaleString()}</span> {symbol}
              </>
            ) : (
              "Estimate will appear here"
            )}
          </div>

          {/* Buy button */}
          <Button
            className="w-full mb-2"
            disabled={sanitisedWei === 0n}
            onClick={() => {
              if (!chosenTranche) return;
              writeContract({
                address: ZAMMLaunchAddress,
                abi: ZAMMLaunchAbi,
                functionName: "buy",
                args: [coinId, BigInt(chosenTranche.trancheIndex)],
                value: sanitisedWei,
              });
              onTxSent();
            }}
          >
            Buy with {formatEther(sanitisedWei)} ETH
          </Button>

          {/* Sweep dust button */}
          {sweepable && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                if (!chosenTranche || remainderWei === null) return;
                writeContract({
                  address: ZAMMLaunchAddress,
                  abi: ZAMMLaunchAbi,
                  functionName: "buy",
                  args: [coinId, BigInt(chosenTranche.trancheIndex)],
                  value: remainderWei,
                });
                onTxSent();
              }}
            >
              Sweep dust ({formatEther(remainderWei!)} ETH)
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
