import { createFileRoute, Link } from "@tanstack/react-router";
import { useGetPool, type Pool } from "@/hooks/use-get-pool";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import PoolPriceChart from "@/components/PoolPriceChart";
import { PoolTokenImage } from "@/components/PoolTokenImage";
import { formatImageURL } from "@/hooks/metadata";
import { Skeleton } from "@/components/ui/skeleton";
import { bpsToPct } from "@/lib/pools";
import { formatEther } from "viem";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/p/$poolId")({
  component: PoolPage,
});

function PoolPage() {
  const { poolId } = Route.useParams();
  const { data: ethUsdPrice } = useEthUsdPrice();

  // Try COOKBOOK first, then ZAMM
  const { data: cookbookPool, isLoading: cookbookLoading } = useGetPool(poolId, "COOKBOOK");
  const { data: zammPool, isLoading: zammLoading } = useGetPool(poolId, "ZAMM");

  const pool = cookbookPool || zammPool;
  const isLoading = cookbookLoading && zammLoading;

  if (isLoading) {
    return <PoolPageSkeleton />;
  }

  if (!pool) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link to="/explore/pools" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="w-4 h-4" />
          Back to pools
        </Link>
        <div className="text-center py-20">
          <h1 className="text-2xl font-bold mb-2">Pool not found</h1>
          <p className="text-muted-foreground">Pool #{poolId} does not exist or has not been indexed yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link to="/explore/pools" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to pools
      </Link>

      <PoolHeader pool={pool} ethUsdPrice={ethUsdPrice} />

      <div className="mt-6 border rounded-lg p-4 bg-card">
        <PoolPriceChart
          poolId={poolId}
          ticker={pool.coin1?.symbol || "TOKEN"}
          ethUsdPrice={ethUsdPrice}
          defaultTimeRange="1w"
        />
      </div>

      <PoolInfo pool={pool} ethUsdPrice={ethUsdPrice} />

      <div className="mt-6 flex gap-3">
        <Link
          to="/positions/create"
          search={{
            tokenA: pool.token0 && pool.coin0?.id ? `${pool.token0}:${pool.coin0.id}` : undefined,
            tokenB: pool.token1 && pool.coin1?.id ? `${pool.token1}:${pool.coin1.id}` : undefined,
            fee: String(pool.swapFee),
            protocol: pool.source === "ZAMM" ? "ZAMMV0" : "ZAMMV1",
          }}
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Add Liquidity
        </Link>
        <Link
          to="/swap"
          search={{
            tokenA: pool.token0 && pool.coin0?.id ? `${pool.token0}:${pool.coin0.id}` : undefined,
            tokenB: pool.token1 && pool.coin1?.id ? `${pool.token1}:${pool.coin1.id}` : undefined,
          }}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Swap
        </Link>
      </div>
    </div>
  );
}

function PoolHeader({ pool, ethUsdPrice }: { pool: Pool; ethUsdPrice?: number }) {
  const img0 = formatImageURL(pool.coin0?.imageUrl || null);
  const img1 = formatImageURL(pool.coin1?.imageUrl || null);
  const sym0 = pool.coin0?.symbol || shortAddr(pool.token0);
  const sym1 = pool.coin1?.symbol || shortAddr(pool.token1);

  const priceEth = pool.price1 ? Number(formatEther(BigInt(pool.price1))) : null;
  const priceUsd = priceEth && ethUsdPrice ? priceEth * ethUsdPrice : null;

  return (
    <div className="flex items-start gap-4">
      <div className="relative w-14 h-10">
        <PoolTokenImage imageUrl0={img0} imageUrl1={img1} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">
            {sym1}/{sym0}
          </h1>
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
            #{pool.id}
          </span>
          <span className={cn(
            "text-xs px-2 py-1 rounded border",
            pool.source === "ZAMM"
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800"
              : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800"
          )}>
            {pool.source === "ZAMM" ? "V0" : "V1"}
          </span>
        </div>
        <div className="mt-1 text-muted-foreground">
          {priceEth != null && (
            <span className="tabular-nums">
              1 {sym1} = Ξ{formatPrice(priceEth)}
              {priceUsd != null && <span className="ml-2 text-sm">(${formatPrice(priceUsd)})</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function PoolInfo({ pool, ethUsdPrice }: { pool: Pool; ethUsdPrice?: number }) {
  const reserve0Eth = pool.reserve0 ? Number(formatEther(BigInt(pool.reserve0))) : null;
  const reserve1Eth = pool.reserve1 ? Number(formatEther(BigInt(pool.reserve1))) : null;

  const totalLiquidityEth = (reserve0Eth || 0) + (reserve1Eth || 0);
  const totalLiquidityUsd = ethUsdPrice ? totalLiquidityEth * ethUsdPrice : null;

  const feeDisplay = pool.swapFee
    ? `${Number(pool.swapFee).toLocaleString()} bps (${bpsToPct(String(pool.swapFee))})`
    : "—";

  const hookDisplay = pool.hookType === "PRE" ? "Pre-hook" : pool.hookType === "POST" ? "Post-hook" : "None";

  return (
    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
      <InfoCard label="Liquidity" value={`Ξ${formatNumber(totalLiquidityEth)}`} subValue={totalLiquidityUsd ? `$${formatNumber(totalLiquidityUsd)}` : undefined} />
      <InfoCard label="Swap Fee" value={feeDisplay} />
      <InfoCard label="Hook" value={hookDisplay} />
      <InfoCard label="Token 0" value={pool.coin0?.symbol || "—"} subValue={shortAddr(pool.token0)} />
      <InfoCard label="Token 1" value={pool.coin1?.symbol || "—"} subValue={shortAddr(pool.token1)} />
      <InfoCard label="Reserve 0" value={reserve0Eth != null ? formatNumber(reserve0Eth) : "—"} />
      <InfoCard label="Reserve 1" value={reserve1Eth != null ? formatNumber(reserve1Eth) : "—"} />
    </div>
  );
}

function InfoCard({ label, value, subValue }: { label: string; value: string; subValue?: string }) {
  return (
    <div className="border rounded-lg p-3 bg-card">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
      {subValue && <div className="text-xs text-muted-foreground mt-0.5">{subValue}</div>}
    </div>
  );
}

function PoolPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Skeleton className="h-4 w-32 mb-6" />
      <div className="flex items-start gap-4">
        <Skeleton className="w-14 h-10 rounded" />
        <div className="flex-1">
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="mt-6 h-[400px] w-full rounded-lg" />
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function shortAddr(addr?: string | null, n = 6) {
  return !addr ? "—" : `${addr.slice(0, n)}…${addr.slice(-4)}`;
}

function formatPrice(value: number): string {
  if (value === 0) return "0";
  if (value < 0.000001) return value.toExponential(2);
  if (value < 0.01) return value.toFixed(8);
  if (value < 1) return value.toFixed(6);
  return value.toFixed(4);
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}
