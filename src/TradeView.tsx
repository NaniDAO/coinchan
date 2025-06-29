import { BuySell } from "./BuySell";
import { ClaimVested } from "./ClaimVested";
import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
} from "wagmi";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { mainnet } from "viem/chains";
import { useCoinData } from "./hooks/metadata";
import { computePoolId } from "./lib/swap";
import { Link } from "@tanstack/react-router";

// Add global styles
import "./buysell-styles.css";

import { CoinPreview } from "./components/CoinPreview";
import ErrorFallback, { ErrorBoundary } from "./components/ErrorBoundary";
import { VotePanel } from "./components/VotePanel";
import { LoadingLogo } from "./components/ui/loading-logo";
import { PoolOverview } from "./components/PoolOverview";

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
  const { data, isLoading } = useCoinData(tokenId);
  const name = data && data.name !== null ? data.name : "Token";
  const symbol = data && data.symbol !== null ? data.symbol : "TKN";

  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  const [isOwner, setIsOwner] = useState(false);
  const [txHash] = useState<`0x${string}`>();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Safely check ownership with error handling
  useEffect(() => {
    if (!publicClient || !tokenId || !address) {
      console.log("TradeView: Missing prerequisites for ownership check");
      return;
    }

    let isMounted = true; // Guard against setting state after unmount

    const checkOwnership = async () => {
      try {
        console.log(
          `TradeView: Checking ownership for token ${tokenId.toString()}`,
        );

        const lockup = (await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "lockups",
          args: [tokenId],
        })) as readonly [string, number, number, boolean, bigint, bigint];

        if (!isMounted) return;

        const [lockupOwner] = lockup;
        const isActualOwner =
          lockupOwner?.toLowerCase() === address.toLowerCase();
        console.log(
          `TradeView: Token ${tokenId.toString()} owner check: ${isActualOwner}`,
        );
        setIsOwner(isActualOwner);
      } catch (err) {
        console.error(
          `TradeView: Failed to fetch lockup owner for token ${tokenId.toString()}:`,
          err,
        );
        if (isMounted) setIsOwner(false);
      }
    };

    checkOwnership();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [publicClient, tokenId, address, isSuccess]);

  // Show loading logo during initial data fetch
  if (isLoading) {
    return (
      <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
        <Link
          to="/explore"
          className="text-sm self-start underline py-2 px-1 touch-manipulation"
        >
          ⬅︎ Back to Explorer
        </Link>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <LoadingLogo size="lg" />
          <p className="text-sm text-muted-foreground">Loading token data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto flex flex-col gap-4 px-2 py-4 pb-16 sm:p-6 sm:pb-16">
      <Link
        to="/explore"
        className="text-sm self-start underline py-2 px-1 touch-manipulation"
      >
        ⬅︎ Back to Explorer
      </Link>

      <CoinPreview
        coinId={tokenId}
        name={name}
        symbol={symbol}
        isLoading={isLoading}
      />

      {/* Wrap BuySell component in an ErrorBoundary to prevent crashes */}
      <ErrorBoundary
        fallback={
          <BuySellFallback tokenId={tokenId} name={name} symbol={symbol} />
        }
      >
        <div>
          <BuySell tokenId={tokenId} name={name} symbol={symbol} />
        </div>
      </ErrorBoundary>
      <ErrorBoundary
        fallback={<ErrorFallback errorMessage="Error rendering voting panel" />}
      >
        <VotePanel coinId={tokenId} />
      </ErrorBoundary>

      {/* Only show ClaimVested if the user is the owner */}
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
        poolId={computePoolId(tokenId).toString()}
        symbol={symbol}
      />
      <div className="mt-4 sm:mt-6"></div>
    </div>
  );
};
