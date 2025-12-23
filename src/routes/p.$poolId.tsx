import { createFileRoute, Link } from "@tanstack/react-router";
import { useGetPool, type Pool } from "@/hooks/use-get-pool";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { usePAMMMarket, type PAMMMarketData } from "@/hooks/use-pamm-market";
import PoolPriceChart from "@/components/PoolPriceChart";
import PredictionMarketOddsChart from "@/components/pools/PredictionMarketOddsChart";
import { PredictionMarketDisplay, PredictionMarketOddsCompact } from "@/components/pools/PredictionMarketDisplay";
import { PoolActivityPanel } from "@/components/pools/PoolActivityPanel";
import { PoolTokenImage } from "@/components/PoolTokenImage";
import { formatImageURL } from "@/hooks/metadata";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { bpsToPct } from "@/lib/pools";
import { formatEther } from "viem";
import { ArrowLeft, TrendingUp, ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPAMMExternalSite } from "@/constants/TrustedResolvers";

export const Route = createFileRoute("/p/$poolId" as any)({
  component: PoolPage,
});

function PoolPage() {
  const { poolId } = Route.useParams() as { poolId: string };
  const { data: ethUsdPrice } = useEthUsdPrice();

  // Try COOKBOOK first, then ZAMM
  const { data: cookbookPool, isLoading: cookbookLoading } = useGetPool(poolId, "COOKBOOK");
  const { data: zammPool, isLoading: zammLoading } = useGetPool(poolId, "ZAMM");

  const pool = cookbookPool || zammPool;
  const isLoading = cookbookLoading && zammLoading;

  // Check if this is a PAMM prediction market pool
  const { data: pammData, isLoading: pammLoading } = usePAMMMarket(pool ?? null);
  const isPredictionMarket = pammData?.isPAMMPool && pammData?.marketId !== null;

  // Show loading while pool data or PAMM discovery is in progress
  if (isLoading || (pammData?.isPAMMPool && pammLoading)) {
    return <PoolPageSkeleton />;
  }

  if (!pool) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          to="/explore/pools"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
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

  // Render prediction market layout if this is a PAMM pool
  if (isPredictionMarket && pammData) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link
          to="/explore/pools"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to pools
        </Link>

        <PredictionMarketHeader pool={pool} pammData={pammData} />

        {/* Prediction Market Odds Display */}
        <div className="mt-6 border rounded-lg p-6 bg-card">
          <PredictionMarketDisplay marketData={pammData} />
        </div>

        {/* Prediction Market Odds History Chart */}
        <div className="mt-6 border rounded-lg p-4 bg-card">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-purple-500" />
            <h3 className="font-medium">Odds History</h3>
            <span className="text-xs text-muted-foreground ml-auto">YES probability over time</span>
          </div>
          <PredictionMarketOddsChart poolId={poolId} yesIsId0={pammData.yesIsId0} defaultTimeRange="1w" />
        </div>

        {/* Pool Info */}
        <PredictionMarketPoolInfo pool={pool} pammData={pammData} />

        {/* Activity Panel */}
        <PoolActivityPanel pool={pool} pammData={pammData} className="mt-6" />

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3 flex-wrap">
          <Link
            to="/predict"
            className={cn(buttonVariants({ variant: "default" }), "bg-purple-600 hover:bg-purple-700")}
          >
            Trade on Predict
          </Link>
          <Link
            to="/positions/create"
            search={
              {
                tokenA: pool.token0 && pool.coin0?.id ? `${pool.token0}:${pool.coin0.id}` : undefined,
                tokenB: pool.token1 && pool.coin1?.id ? `${pool.token1}:${pool.coin1.id}` : undefined,
                fee: String(pool.swapFee),
                protocol: pool.source === "ZAMM" ? "ZAMMV0" : "ZAMMV1",
              } as any
            }
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Add Liquidity
          </Link>
          <Link
            to="/swap"
            search={{
              sellToken: pool.token0 && pool.coin0?.id ? `${pool.token0}:${pool.coin0.id}` : undefined,
              buyToken: pool.token1 && pool.coin1?.id ? `${pool.token1}:${pool.coin1.id}` : undefined,
            }}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Swap YES/NO
          </Link>
        </div>
      </div>
    );
  }

  // Default pool layout for non-prediction market pools
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link
        to="/explore/pools"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
      >
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

      {/* Activity Panel */}
      <PoolActivityPanel pool={pool} className="mt-6" />

      <div className="mt-6 flex gap-3">
        <Link
          to="/positions/create"
          search={
            {
              tokenA: pool.token0 && pool.coin0?.id ? `${pool.token0}:${pool.coin0.id}` : undefined,
              tokenB: pool.token1 && pool.coin1?.id ? `${pool.token1}:${pool.coin1.id}` : undefined,
              fee: String(pool.swapFee),
              protocol: pool.source === "ZAMM" ? "ZAMMV0" : "ZAMMV1",
            } as any
          }
          className={cn(buttonVariants({ variant: "default" }))}
        >
          Add Liquidity
        </Link>
        <Link
          to="/swap"
          search={{
            sellToken: pool.token0 && pool.coin0?.id ? `${pool.token0}:${pool.coin0.id}` : undefined,
            buyToken: pool.token1 && pool.coin1?.id ? `${pool.token1}:${pool.coin1.id}` : undefined,
          }}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Swap
        </Link>
      </div>
    </div>
  );
}

function PredictionMarketHeader({
  pool,
  pammData,
}: {
  pool: Pool;
  pammData: PAMMMarketData;
}) {
  const imageUrl = formatImageURL(pool.coin0?.imageUrl || null);
  const externalSite = pammData.resolver ? getPAMMExternalSite(pammData.resolver) : null;

  return (
    <div className="flex items-start gap-4">
      {/* Prediction Market Icon */}
      <Avatar className="w-14 h-14 rounded-xl shadow-lg shrink-0">
        <AvatarImage src={imageUrl || undefined} alt={pool.coin0?.symbol || "Market"} />
        <AvatarFallback className="rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white text-2xl">
          🎯
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            PAMM Pool
          </span>
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">#{pool.id}</span>
          {externalSite && (
            <a
              href={externalSite.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded bg-card border border-border hover:bg-muted transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 100 100">
                <rect fill="#09090b" width="100" height="100" rx="12" />
                <text
                  x="50"
                  y="55"
                  fontFamily="system-ui,sans-serif"
                  fontSize="16"
                  fontWeight="600"
                  fill={externalSite.logo.colorTop}
                  textAnchor="middle"
                >
                  {externalSite.logo.textTop}
                </text>
                <text
                  x="50"
                  y="72"
                  fontFamily="system-ui,sans-serif"
                  fontSize="14"
                  fontWeight="600"
                  fill="#3b82f6"
                  textAnchor="middle"
                >
                  PM
                </text>
              </svg>
              <span className="font-medium">{externalSite.name}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          )}
        </div>
        {/* Market Question/Description */}
        {pammData.description ? (
          <h1 className="text-xl font-bold mt-2 line-clamp-2">{pammData.description}</h1>
        ) : (
          <h1 className="text-xl font-bold mt-2">Prediction Market</h1>
        )}
        {/* Compact Odds Display in Header */}
        <div className="mt-2">
          <PredictionMarketOddsCompact
            yesPercent={pammData.yesPercent}
            noPercent={pammData.noPercent}
            resolved={pammData.resolved}
            outcome={pammData.outcome}
          />
        </div>
      </div>
    </div>
  );
}

function PredictionMarketPoolInfo({
  pool,
  pammData,
}: {
  pool: Pool;
  pammData: PAMMMarketData;
}) {
  const reserve0 = pool.reserve0 ? Number(formatEther(BigInt(pool.reserve0))) : null;
  const reserve1 = pool.reserve1 ? Number(formatEther(BigInt(pool.reserve1))) : null;
  const totalLiquidity = (reserve0 || 0) + (reserve1 || 0);

  const feeDisplay = pool.swapFee
    ? `${Number(pool.swapFee).toLocaleString()} bps (${bpsToPct(String(pool.swapFee))})`
    : "—";

  const formatCollateral = (value: bigint | null) => {
    if (!value) return "—";
    const num = Number(formatEther(value));
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(4);
  };

  return (
    <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
      <InfoCard
        label="YES Reserves"
        value={pammData.rYes !== null ? formatNumber(Number(formatEther(pammData.rYes))) : "—"}
        subValue={pammData.yesIsId0 ? "Token 0" : "Token 1"}
      />
      <InfoCard
        label="NO Reserves"
        value={pammData.rNo !== null ? formatNumber(Number(formatEther(pammData.rNo))) : "—"}
        subValue={pammData.yesIsId0 ? "Token 1" : "Token 0"}
      />
      <InfoCard label="Total Liquidity" value={formatNumber(totalLiquidity)} />
      <InfoCard label="Swap Fee" value={feeDisplay} />
      <InfoCard label="Collateral Locked" value={formatCollateral(pammData.collateralLocked)} />
      <InfoCard label="YES Supply" value={pammData.yesSupply !== null ? formatCollateral(pammData.yesSupply) : "—"} />
      <InfoCard label="NO Supply" value={pammData.noSupply !== null ? formatCollateral(pammData.noSupply) : "—"} />
      <InfoCard
        label="Market Status"
        value={pammData.resolved ? (pammData.outcome ? "YES Won" : "NO Won") : pammData.tradingOpen ? "Open" : "Closed"}
      />
    </div>
  );
}

function PoolHeader({
  pool,
  ethUsdPrice,
}: {
  pool: Pool;
  ethUsdPrice?: number;
}) {
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
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">#{pool.id}</span>
          <span
            className={cn(
              "text-xs px-2 py-1 rounded border",
              pool.source === "ZAMM"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800"
                : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-400 dark:border-indigo-800",
            )}
          >
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
      <InfoCard
        label="Liquidity"
        value={`Ξ${formatNumber(totalLiquidityEth)}`}
        subValue={totalLiquidityUsd ? `$${formatNumber(totalLiquidityUsd)}` : undefined}
      />
      <InfoCard label="Swap Fee" value={feeDisplay} />
      <InfoCard label="Hook" value={hookDisplay} />
      <InfoCard label="Token 0" value={pool.coin0?.symbol || "—"} subValue={shortAddr(pool.token0)} />
      <InfoCard label="Token 1" value={pool.coin1?.symbol || "—"} subValue={shortAddr(pool.token1)} />
      <InfoCard label="Reserve 0" value={reserve0Eth != null ? formatNumber(reserve0Eth) : "—"} />
      <InfoCard label="Reserve 1" value={reserve1Eth != null ? formatNumber(reserve1Eth) : "—"} />
    </div>
  );
}

function InfoCard({
  label,
  value,
  subValue,
}: {
  label: string;
  value: string;
  subValue?: string;
}) {
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
