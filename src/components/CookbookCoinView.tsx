import { Link } from "@tanstack/react-router";
import { CoinPreview } from "./CoinPreview";
import ErrorFallback, { ErrorBoundary } from "./ErrorBoundary";
import { BuySellFallback } from "@/TradeView";
import { BuyCoinSale } from "./BuyCoinSale";
import { VotePanel } from "./VotePanel";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { useMemo } from "react";
import { CoinInfoCard } from "./CoinInfoCard";
import { useReadContract } from "wagmi";
import { mainnet } from "viem/chains";
import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "@/constants/CheckTheChain";
import { PoolOverview } from "./PoolOverview";
import { computePoolId, SWAP_FEE } from "@/lib/swap";
import { CookbookAddress } from "@/constants/Cookbook";

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

  const [name, symbol, imageUrl, description, tokenURI, poolId, swapFee] =
    useMemo(() => {
      if (!data) return ["", "", "", "", "", undefined, 100n];
      return [
        data.name!,
        data.symbol!,
        data.imageUrl!,
        data.description!,
        data.tokenURI!,
        data.poolId!,
        data.swapFee,
      ];
    }, [data]);

  const marketCapUsd = useMemo(() => {
    if (!data || !ethPriceData) return null;

    const priceStr = ethPriceData[1];
    const ethPriceUsd = parseFloat(priceStr);

    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;
    if (data.marketCapEth === undefined) return null;

    return data.marketCapEth * ethPriceUsd;
  }, [data, ethPriceData]);

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
      <ErrorBoundary
        fallback={
          <ErrorFallback errorMessage="Error rendering Coin Info Card" />
        }
      >
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
          <BuyCoinSale
            coinId={coinId}
            symbol={symbol.length === 0 ? name : symbol}
          />
        </div>
      </ErrorBoundary>
      <ErrorBoundary
        fallback={<ErrorFallback errorMessage="Error rendering voting panel" />}
      >
        <VotePanel coinId={BigInt(coinId)} />
      </ErrorBoundary>
      <PoolOverview
        poolId={computePoolId(coinId, SWAP_FEE, CookbookAddress).toString()}
        symbol={symbol}
      />
    </div>
  );
};
