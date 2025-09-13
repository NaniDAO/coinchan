import { useMemo, useState } from "react";
import { BuySell } from "./BuySell";
import { ClaimVested } from "./ClaimVested";

import { mainnet } from "viem/chains";
import { useReadContract, useWaitForTransactionReceipt } from "wagmi";
import { SWAP_FEE, computePoolId } from "./lib/swap";

import { CoinInfoCard } from "./components/CoinInfoCard";
import { CoinPreview } from "./components/CoinPreview";
import ErrorFallback, { ErrorBoundary } from "./components/ErrorBoundary";
import { PoolOverview } from "./components/PoolOverview";
import { VotePanel } from "./components/VotePanel";
import { LoadingLogo } from "./components/ui/loading-logo";
import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "./constants/CheckTheChain";
import { CoinsAddress } from "./constants/Coins";
import { useGetCoin } from "./hooks/metadata/use-get-coin";
import { useIsOwner } from "./hooks/use-is-owner";

// Fallback component for BuySell when it crashes
export const BuySellFallback = ({
  tokenId,
  name,
  symbol,
}: {
  tokenId: bigint;
  name: string;
  symbol: string;
}) => {
  return (
    <div className="p-4 border border-destructive/30 bg-destructive/10 rounded-md">
      <h3 className="font-medium text-destructive">
        Trading temporarily unavailable
      </h3>
      <p className="text-sm text-destructive/80 mt-2">
        We're experiencing issues loading the trading interface for {name} [
        {symbol}]. Please try again later.
      </p>
      <div className="mt-4 bg-background p-3 rounded-md text-sm border border-border">
        <p className="font-medium">Token Details:</p>
        <p className="text-xs md:text-sm break-words break-all whitespace-normal overflow-hidden">
          ID: {tokenId.toString()}
        </p>
        <p>Name: {name}</p>
        <p>Symbol: {symbol}</p>
      </div>
    </div>
  );
};

export const TradeView = ({ tokenId }: { tokenId: bigint }) => {
  // Using our new hook to get coin data
  const { data, isLoading: isLoadingGetCoin } = useGetCoin({
    coinId: tokenId.toString(),
    token: CoinsAddress,
  });

  const [name, symbol, imageUrl, description, tokenURI, _poolIds, swapFees] =
    useMemo(() => {
      if (!data) return ["", "", "", "", "", undefined, [100n]];
      const pools = data.pools.map((pool) => pool.poolId);
      const swapFees = data.pools.map((pool) => BigInt(pool.swapFee));
      return [
        data.name!,
        data.symbol!,
        data.imageUrl!,
        data.description!,
        data.tokenURI!,
        pools,
        swapFees,
      ];
    }, [data]);

  const [txHash] = useState<`0x${string}`>();
  const [priceImpact, setPriceImpact] = useState<{
    currentPrice: number;
    projectedPrice: number;
    impactPercent: number;
    action: "buy" | "sell";
  } | null>(null);
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { data: isOwner, isLoading: isCheckingOwner } = useIsOwner({
    tokenId,
    refetchKey: isSuccess, // triggers a fresh read once the tx is mined
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

  const marketCapUsd = useMemo(() => {
    if (!data || !ethPriceData) return null;

    const priceStr = ethPriceData[1];
    const ethPriceUsd = Number.parseFloat(priceStr);

    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;
    if (data.marketCapEth === undefined) return null;

    return data.marketCapEth * ethPriceUsd;
  }, [data, ethPriceData]);

  // Show loading logo during initial data fetch
  if (isLoadingGetCoin) {
    return (
      <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <LoadingLogo size="lg" />
          <p className="text-sm text-muted-foreground">Loading token data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
      <CoinPreview
        coinId={tokenId}
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
          coinId={tokenId}
          name={name}
          symbol={symbol}
          description={description || "No description available"}
          imageUrl={imageUrl}
          swapFee={swapFees}
          isOwner={isOwner ?? false}
          type={"ZAMM"}
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
          <BuySellFallback tokenId={tokenId} name={name} symbol={symbol} />
        }
      >
        <div>
          <BuySell
            tokenId={tokenId}
            symbol={symbol}
            onPriceImpactChange={setPriceImpact}
          />
        </div>
      </ErrorBoundary>
      <ErrorBoundary
        fallback={<ErrorFallback errorMessage="Error rendering voting panel" />}
      >
        <VotePanel coinId={tokenId} />
      </ErrorBoundary>

      {/* Only show ClaimVested if the user is the owner */}
      {isCheckingOwner && <LoadingLogo size="sm" />}
      {isOwner && (
        <div className="mt-4 sm:mt-6 max-w-2xl">
          <ErrorBoundary
            fallback={
              <p className="text-destructive">
                Vesting claim feature unavailable
              </p>
            }
          >
            <ClaimVested coinId={tokenId} />
          </ErrorBoundary>
        </div>
      )}
      <PoolOverview
        coinId={tokenId.toString()}
        poolId={computePoolId(
          tokenId,
          swapFees?.[0] ?? SWAP_FEE,
          CoinsAddress,
        ).toString()}
        symbol={symbol}
        priceImpact={priceImpact}
        token={CoinsAddress}
      />
      <div className="mt-4 sm:mt-6"></div>
    </div>
  );
};
