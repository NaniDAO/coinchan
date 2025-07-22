import { BuySellPool } from "@/components/BuySellPool";
import { PoolOverview } from "@/components/PoolOverview";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { usePool } from "@/hooks/use-pool";
import { CoinSource } from "@/lib/coins";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatUnits } from "viem";

export const Route = createFileRoute("/p/$poolId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { poolId } = Route.useParams();

  const [priceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);

  if (isNaN(Number(poolId))) {
    return (
      <Alert className="p-2 max-w-2xl mt-2 ml-2">
        <AlertTitle>Invalid Pool ID</AlertTitle>
      </Alert>
    );
  }

  const { data, isLoading, isError, error } = usePool(poolId);

  if (isLoading) return <div>Loading pool...</div>;
  if (isError) return <div>Error: {error.message}</div>;
  if (!data) return <div>Pool not found</div>;

  const formatReserves = (reserve: string, decimals: number) => {
    const value = Number(formatUnits(BigInt(reserve), decimals));
    if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(2)}K`;
    return value.toFixed(2);
  };

  const formatSwapFee = (fee: string) => {
    return fee;
  };

  console.log("data", data);
  return (
    <div className="w-full mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
      <Link
        to="/explore"
        className="text-sm self-start text-blue-600 underline py-2 px-1 touch-manipulation"
      >
        ← Back to Explorer
      </Link>

      <div>
        <div className="flex flex-row justify-between items-center gap-2">
          <h1 className="text-2xl font-black tracking-wide">
            {data.coin0.symbol} / {data.coin1.symbol}
          </h1>
          <Badge variant="secondary">
            Updated {new Date(Number(data.updatedAt)).toLocaleString()}
          </Badge>
        </div>
        <p className="text-sm text-primary mt-1">Liquidity Pool</p>

        <div className="text-sm text-primary mt-3 space-y-2">
          <p>
            Trade between {data.coin0.symbol} and {data.coin1.symbol}.
            {data.hook &&
            data.hook !== "0x0000000000000000000000000000000000000000" ? (
              <span className="ml-1">
                Enhanced with a {data.hookType || "custom"} hook.{" "}
                <a
                  href={`https://etherscan.io/address/${data.hook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View Hook
                </a>
              </span>
            ) : (
              <span className="ml-1">
                This is standard ZAMM pool with no additional hooks.
              </span>
            )}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-3 border-t border-border">
            <div>
              <span className="text-xs uppercase tracking-wide text-accent font-medium">
                Swap Fee
              </span>
              <div className="text-lg font-semibold mt-1">
                {formatSwapFee(data.swapFee)}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide text-accent font-medium">
                Total Reserves
              </span>
              <div className="mt-1 flex flex-row items-center space-x-1">
                <div className="text-lg font-semibold">
                  {formatReserves(data.reserve0, data.coin0.decimals)}{" "}
                  {data.coin0.symbol}
                </div>
                <span>/</span>
                <div className="text-lg font-semibold">
                  {formatReserves(data.reserve1, data.coin1.decimals)}{" "}
                  {data.coin1.symbol}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <BuySellPool poolId={BigInt(poolId)} source={data.source as CoinSource} />
      <PoolOverview
        coinId={data?.coin1Id}
        token={data?.token1}
        poolId={poolId}
        symbol={data?.coin1.symbol}
        priceImpact={priceImpact}
      />
    </div>
  );
}
