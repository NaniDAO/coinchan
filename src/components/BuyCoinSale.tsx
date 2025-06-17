import { ZAMMLaunchAbi, ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { useWriteContract, useAccount, useBalance } from "wagmi";
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

interface Tranche {
  coins: string;
  deadline: string;
  price: string;
  remaining: string;
  trancheIndex: number;
  sold: string;
}

export const BuyCoinSale = ({
  coinId,
  symbol,
}: {
  coinId: bigint;
  symbol: string;
}) => {
  const { data: sale, isLoading } = useCoinSale({ coinId: coinId.toString() });
  const { writeContract } = useWriteContract();
  const { address } = useAccount();
  const { data: balanceData } = useBalance({ address, watch: true });

  // ──────────────── LOCAL STATE ────────────────
  const [selected, setSelected] = useState<number | null>(null); // trancheIndex
  const [mode, setMode] = useState<"ETH" | "TOKEN">("ETH");
  const [ethInput, setEthInput] = useState<string>(""); // user's typed ETH
  const [tokenInput, setTokenInput] = useState<string>(""); // user's typed token amount

  // Pick cheapest tranche as default when data arrives
  useEffect(() => {
    if (!sale) return;

    const actives = sale.tranches.items.filter(
      (tranche: Tranche) =>
        parseInt(tranche.remaining) > 0 &&
        new Date(Number(tranche.deadline) * 1000) > new Date(),
    );

    if (actives.length) {
      const cheapest = actives.reduce((p: Tranche, c: Tranche) =>
        BigInt(p.price) < BigInt(c.price) ? p : c,
      );
      setSelected(cheapest.trancheIndex);
    }
  }, [sale]);

  const chosenTranche: Tranche | undefined = useMemo(
    () =>
      sale?.tranches.items.find((t: Tranche) => t.trancheIndex === selected),
    [sale, selected],
  );

  // Estimate tokens received when spending ETH
  const estimateTokens = useMemo(() => {
    if (!chosenTranche || !ethInput) return undefined;
    try {
      const weiInput = BigInt(parseFloat(ethInput) * 1e18);
      const priceWei = BigInt(chosenTranche.price);
      const coinsWei = BigInt(chosenTranche.coins);
      const tokensWei = (weiInput * coinsWei) / priceWei;
      return formatEther(tokensWei);
    } catch {
      return undefined;
    }
  }, [chosenTranche, ethInput]);

  // Estimate ETH needed when buying tokens
  const estimateEth = useMemo(() => {
    if (!chosenTranche || !tokenInput) return undefined;
    try {
      const tokensWei = BigInt(parseFloat(tokenInput) * 1e18);
      const priceWei = BigInt(chosenTranche.price);
      const coinsWei = BigInt(chosenTranche.coins);
      const ethWei = (tokensWei * priceWei) / coinsWei;
      return formatEther(ethWei);
    } catch {
      return undefined;
    }
  }, [chosenTranche, tokenInput]);

  const handleMax = () => {
    if (mode === "ETH") {
      if (balanceData?.value) {
        setEthInput(formatEther(balanceData.value));
      }
    } else {
      if (chosenTranche) {
        setTokenInput(formatEther(BigInt(chosenTranche.remaining)));
      }
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (!sale) return <div>Sale not found</div>;

  if (sale.status === "FINALIZED")
    return <BuySellCookbookCoin coinId={coinId} symbol={symbol} />;

  const activeTranches = sale.tranches.items.filter(
    (tranche: Tranche) =>
      parseInt(tranche.remaining) > 0 &&
      new Date(Number(tranche.deadline) * 1000) > new Date(),
  );

  // Prepare data for recharts
  const chartData = sale.tranches.items.map((tranche: Tranche) => ({
    name: `Tranche ${tranche.trancheIndex}`,
    sold: Number(formatEther(BigInt(tranche.sold))),
    remaining: Number(formatEther(BigInt(tranche.remaining))),
    price: Number(formatEther(BigInt(tranche.price))),
    priceNum: Number(formatEther(BigInt(tranche.price))), // For the line chart
    deadline: new Date(Number(tranche.deadline) * 1000).toLocaleString(),
    trancheIndex: tranche.trancheIndex,
    isSelected: tranche.trancheIndex === selected,
  }));

  return (
    <div className="border-2 border-secondary">
      <div className="flex justify-between items-center p-2 border-b border-secondary">
        <h2 className="text-xl font-bold ">Sale</h2>
        <Badge variant="outline">
          <PillIndicator variant={statusToPillVariant(sale.status)} pulse />
          <span className="ml-1">{sale.status}</span>
        </Badge>
      </div>

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
                {/* ... gradients and chart setup unchanged ... */}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ──────────── SELECT MODE ──────────── */}
      <div className="flex space-x-2 px-2 mt-4">
        <button
          onClick={() => setMode("ETH")}
          className={twMerge(
            "px-4 py-2 rounded-lg",
            mode === "ETH" ? "bg-accent text-white" : "bg-sidebar",
          )}
        >
          Spend ETH
        </button>
        <button
          onClick={() => setMode("TOKEN")}
          className={twMerge(
            "px-4 py-2 rounded-lg",
            mode === "TOKEN" ? "bg-accent text-white" : "bg-sidebar",
          )}
        >
          Buy Tokens
        </button>
      </div>

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
              <div className="text-sm">
                Price: {formatEther(BigInt(t.price))} ETH
              </div>
              <div className="text-sm">
                Remaining: {formatEther(BigInt(t.remaining))} {symbol}
              </div>
            </button>
          );
        })}
      </div>

      {/* ──────────── INPUT & ESTIMATE ──────────── */}
      {chosenTranche && (
        <div className="mt-4 p-4 bg-sidebar rounded-2xl shadow-sm mx-2 mb-2">
          <label className="block text-sm font-medium mb-1">
            {mode === "ETH"
              ? `Enter ETH to spend on Tranche ${chosenTranche.trancheIndex}`
              : `Enter ${symbol} amount to buy from Tranche ${chosenTranche.trancheIndex}`}
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
              type="button"
              onClick={handleMax}
              className="ml-2 px-3 py-1 text-sm font-medium bg-sidebar rounded"
            >
              MAX
            </button>
          </div>
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
                "Estimate will appear here"
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
              "Estimate will appear here"
            )}
          </div>
          <Button
            className="w-full"
            disabled={
              mode === "ETH"
                ? !ethInput || !Number(ethInput)
                : !tokenInput || !Number(tokenInput)
            }
            onClick={() => {
              if (!chosenTranche) return;
              const ethValue = mode === "ETH" ? ethInput : estimateEth || "0";
              writeContract({
                address: ZAMMLaunchAddress,
                abi: ZAMMLaunchAbi,
                functionName: "buy",
                args: [coinId, BigInt(chosenTranche.trancheIndex)],
                value: parseEther(ethValue),
              });
            }}
          >
            Buy with{" "}
            {mode === "ETH"
              ? `${ethInput || "0"} ETH`
              : `${tokenInput || "0"} ${symbol}`}
          </Button>
        </div>
      )}
    </div>
  );
};
