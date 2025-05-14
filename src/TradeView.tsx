import { BuySell } from "./BuySell";
import { ClaimVested } from "./ClaimVested";
import { useEffect, useState, Component, ReactNode } from "react";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
} from "wagmi";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { mainnet } from "viem/chains";
import { useCoinData } from "./hooks/metadata";
// import PoolCandleChart from "./PoolCandleChart";
import { computePoolId } from "./lib/swapHelper";
import PoolPriceChart from "./PoolPriceChart";
import { Link } from "@tanstack/react-router";
import { PoolEvents } from "./components/PoolEvents";

// Simple error boundary to prevent crashes
class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Component Error:", error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Fallback component for BuySell when it crashes
const BuySellFallback = ({
  tokenId,
  name,
  symbol,
}: {
  tokenId: bigint;
  name: string;
  symbol: string;
}) => {
  return (
    <div className="p-4 border border-red-300 bg-red-50 rounded-md">
      <h3 className="font-medium text-red-700">
        Trading temporarily unavailable
      </h3>
      <p className="text-sm text-red-600 mt-2">
        We're experiencing issues loading the trading interface for {name} [
        {symbol}]. Please try again later.
      </p>
      <div className="mt-4 bg-white p-3 rounded-md text-sm">
        <p className="font-medium">Token Details:</p>
        <p>ID: {tokenId.toString()}</p>
        <p>Name: {name}</p>
        <p>Symbol: {symbol}</p>
      </div>
    </div>
  );
};

export const TradeView = ({ tokenId }: { tokenId: bigint }) => {
  // Using our new hook to get coin data
  const { getDisplayValues } = useCoinData(tokenId);
  const { name = "Token", symbol = "TKN" } = getDisplayValues();

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

  return (
    <div className="w-full max-w-screen mx-auto flex flex-col gap-4 px-2 py-4 sm:p-6">
      <Link
        to="/explore"
        className="text-sm self-start underline py-2 px-1 touch-manipulation"
      >
        ⬅︎ Back to Explorer
      </Link>

      <div className="flex flex-col items-start gap-2">
        <h2 className="text-lg sm:text-xl font-semibold">
          {name} [{symbol}]
        </h2>
        {/* Metadata like tokenId */}
        <p className="text-sm">ID: {tokenId.toString()}</p>
      </div>

      {/* Wrap BuySell component in an ErrorBoundary to prevent crashes */}
      <ErrorBoundary
        fallback={
          <BuySellFallback tokenId={tokenId} name={name} symbol={symbol} />
        }
      >
        <BuySell tokenId={tokenId} name={name} symbol={symbol} />
      </ErrorBoundary>

      {/* Only show ClaimVested if the user is the owner */}
      {isOwner && (
        <div className="mt-4 sm:mt-6">
          <ErrorBoundary
            fallback={
              <p className="text-red-500">Vesting claim feature unavailable</p>
            }
          >
            <ClaimVested coinId={tokenId} />
          </ErrorBoundary>
        </div>
      )}

      {/* Only show Unlock if the user is the owner */}
      {/* <div className="mt-4 sm:mt-6">
        // only data upto 30 april is being returned ??? so removing for now
        <ErrorBoundary
          fallback={<p className="text-red-500">Pool chart unavailable</p>}
        >
          <PoolCandleChart poolId={computePoolId(tokenId).toString()} />
        </ErrorBoundary>
      </div> */}
      <div className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={<p className="text-red-500">Pool chart unavailable</p>}
        >
          <PoolPriceChart
            poolId={computePoolId(tokenId).toString()}
            ticker={symbol}
          />
        </ErrorBoundary>
      </div>
      <div className="mt-4 sm:mt-6">
        <ErrorBoundary
          fallback={<p className="text-red-500">Pool Events unavailable</p>}
        >
          <PoolEvents
            poolId={computePoolId(tokenId).toString()}
            ticker={symbol}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
};
