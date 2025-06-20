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
import { CoinInfoCard } from "./CoinInfoCard";
import { useReadContract } from "wagmi";
import { mainnet } from "viem/chains";
import { CheckTheChainAbi, CheckTheChainAddress } from "@/constants/CheckTheChain";
import { P2PTradingToggle } from "./P2PTradingToggle";
import { useCoinSale } from "@/hooks/use-coin-sale";

export const CookbookCoinView = ({ coinId }: { coinId: bigint }) => {
  const { data, isLoading: isLoadingGetCoin } = useGetCoin({
    coinId: coinId.toString(),
  });
  const { data: ethPriceData } = useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: ["WETH"],
    chainId: mainnet.id,
    query: {
      staleTime: 60_000,
    },
  });
  const { data: sale } = useCoinSale({ coinId: coinId.toString() });

  const [name, symbol, imageUrl, description, tokenURI, poolId, swapFee] = useMemo(() => {
    if (!data) return ["", "", "", "", "", undefined, 100n];
    return [data.name!, data.symbol!, data.imageUrl!, data.description!, data.tokenURI!, data.poolId!, data.swapFee];
  }, [data]);

  const marketCapUsd = useMemo(() => {
    if (!data || !ethPriceData) return null;

    const priceStr = ethPriceData[1];
    const ethPriceUsd = parseFloat(priceStr);

    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;
    if (data.marketCapEth === undefined) return null;

    return data.marketCapEth * ethPriceUsd;
  }, [data, ethPriceData]);

  // Determine if launchpad sale is still active
  const isLaunchpadActive = useMemo(() => {
    if (!sale) return false;
    
    // Check if sale is finalized
    if (sale.status === "FINALIZED") return false;
    
    // Check if any tranche is still active
    const hasActiveTranches = sale.tranches.items.some(
      (tranche: any) =>
        BigInt(tranche.remaining) > 0n && 
        Number(tranche.deadline) * 1000 > Date.now()
    );
    
    // Check overall deadline if available
    const overallDeadlineActive = !sale.deadlineLast || 
      Number(sale.deadlineLast) * 1000 > Date.now();
    
    return hasActiveTranches && overallDeadlineActive;
  }, [sale]);

  // Get the last deadline for display
  const launchpadEndTime = useMemo(() => {
    if (!sale?.deadlineLast) return undefined;
    return Number(sale.deadlineLast);
  }, [sale]);

  console.log("CoinInfoCard:", {
    data: {
      name,
      symbol,
      imageUrl,
      description,
      tokenURI,
      poolId,
      swapFee,
      marketCapUsd,
    },
    actualData: data,
  });

  return (
    <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
      <Link to="/explore" className="text-sm self-start underline py-2 px-1 touch-manipulation">
        ⬅︎ Back to Explorer
      </Link>
      <CoinPreview coinId={BigInt(coinId)} name={name} symbol={symbol} isLoading={isLoadingGetCoin} />
      <ErrorBoundary fallback={<ErrorFallback errorMessage="Error rendering Coin Info Card" />}>
        <CoinInfoCard
          coinId={coinId}
          name={name}
          symbol={symbol}
          description={description || "No description available"}
          imageUrl={imageUrl}
          swapFee={Number(swapFee)}
          isOwner={false}
          type={"COOKBOOK"}
          marketCapEth={data?.marketCapEth ?? 0}
          marketCapUsd={marketCapUsd ?? 0}
          isEthPriceData={ethPriceData !== undefined}
          tokenURI={tokenURI ?? ""}
          isLoading={isLoadingGetCoin}
        />
      </ErrorBoundary>
      {/* Wrap BuySell component in an ErrorBoundary to prevent crashes */}
      <ErrorBoundary fallback={<BuySellFallback tokenId={BigInt(coinId)} name={name} symbol={symbol} />}>
        <div className="max-w-2xl">
          <BuyCoinSale coinId={coinId} symbol={symbol.length === 0 ? name : symbol} />
        </div>
      </ErrorBoundary>
      
      {/* P2P Trading Toggle */}
      <ErrorBoundary fallback={<ErrorFallback errorMessage="Error rendering P2P trading panel" />}>
        <div className="max-w-2xl">
          <P2PTradingToggle
            cookbookCoinId={coinId}
            cookbookSymbol={symbol.length === 0 ? name : symbol}
            cookbookName={name}
            isLaunchpadActive={isLaunchpadActive}
            launchpadEndTime={launchpadEndTime}
          />
        </div>
      </ErrorBoundary>
      <ErrorBoundary fallback={<ErrorFallback errorMessage="Error rendering voting panel" />}>
        <VotePanel coinId={BigInt(coinId)} />
      </ErrorBoundary>
      <div className="mt-4 sm:mt-6">
        <ErrorBoundary fallback={<p className="text-destructive">Pool chart unavailable</p>}>
          {poolId ? <PoolPriceChart poolId={poolId.toString()} ticker={symbol ?? "TKN"} /> : null}
        </ErrorBoundary>
      </div>
      <div className="mt-4 sm:mt-6">
        <ErrorBoundary fallback={<p className="text-destructive">Pool Events unavailable</p>}>
          {poolId ? <PoolEvents poolId={poolId.toString()} ticker={symbol} /> : null}
        </ErrorBoundary>
      </div>
    </div>
  );
};
