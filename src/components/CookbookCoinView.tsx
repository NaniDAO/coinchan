import { Link } from "@tanstack/react-router";
import { CoinPreview } from "./CoinPreview";
import ErrorFallback, { ErrorBoundary } from "./ErrorBoundary";
import { BuySellFallback } from "@/TradeView";
import { BuyCoinSale } from "./BuyCoinSale";
import { VotePanel } from "./VotePanel";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { PoolEvents } from "./PoolEvents";
import { useMemo } from "react";
import PoolPriceChart from "@/PoolPriceChart";

export const CookbookCoinView = ({ coinId }: { coinId: bigint }) => {
  const { data, isLoading: isLoadingGetCoin } = useGetCoin({
    coinId: coinId.toString(),
  });

  const [name, symbol, poolId] = useMemo(() => {
    if (!data) return ["", "", undefined];
    return [data.name!, data.symbol!, data.poolId!];
  }, [data]);

  return (
    <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
      <Link
        to="/explore"
        className="text-sm self-start underline py-2 px-1 touch-manipulation"
      >
        ⬅︎ Back to Explorer
      </Link>
      <CoinPreview
        coinId={BigInt(coinId)}
        name={name}
        symbol={symbol}
        isLoading={isLoadingGetCoin}
      />
      {/* Wrap BuySell component in an ErrorBoundary to prevent crashes */}
      <ErrorBoundary
        fallback={
          <BuySellFallback
            tokenId={BigInt(coinId)}
            name={name}
            symbol={symbol}
          />
        }
      >
        <div className="max-w-2xl">
          <BuyCoinSale coinId={coinId} />
        </div>
      </ErrorBoundary>
      <ErrorBoundary
        fallback={<ErrorFallback errorMessage="Error rendering voting panel" />}
      >
        <VotePanel coinId={BigInt(coinId)} />
      </ErrorBoundary>
      <div className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={<p className="text-destructive">Pool chart unavailable</p>}
        >
          {poolId ? (
            <PoolPriceChart
              poolId={poolId.toString()}
              ticker={symbol ?? "TKN"}
            />
          ) : null}
        </ErrorBoundary>
      </div>
      <div className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={<p className="text-destructive">Pool Events unavailable</p>}
        >
          {poolId ? (
            <PoolEvents poolId={poolId.toString()} ticker={symbol} />
          ) : null}
        </ErrorBoundary>
      </div>
    </div>
  );
};
