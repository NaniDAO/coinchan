import React, { useState } from "react";
import { useReadContract, useAccount } from "wagmi";
import { useNavigate } from "@tanstack/react-router";
import { formatEther } from "viem";
import {
  PAMMSingletonAddress,
  PAMMSingletonAbi,
  DEFAULT_FEE_OR_HOOK,
} from "@/constants/PAMMSingleton";
import { MarketCard } from "./MarketCard";
import { TradeModal } from "./TradeModal";
import { LimitOrderForm } from "./LimitOrderForm";
import { SwapSharesForm } from "./SwapSharesForm";
import { OrderbookDisplay } from "./OrderbookDisplay";
import { UserOrdersList } from "./UserOrdersList";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  TrendingUp,
  BookOpen,
  ArrowLeftRight,
  ListOrdered,
} from "lucide-react";
import { Heading } from "@/components/ui/typography";
import { PredictErrorBoundary } from "./ErrorBoundary";
import { useMarketOrderbook } from "@/hooks/use-market-orderbook";
import { cn } from "@/lib/utils";

interface MarketDetailPageProps {
  marketId: string;
}

const MarketDetailPageContent: React.FC<MarketDetailPageProps> = ({
  marketId,
}) => {
  const navigate = useNavigate();
  const { address } = useAccount();
  const [isYes, setIsYes] = useState(true);
  const [tradeTab, setTradeTab] = useState<"market" | "limit" | "swap">(
    "market"
  );
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);

  // Convert marketId string to BigInt
  const marketIdBigInt = BigInt(marketId);

  // Fetch single market data using getMarket
  const {
    data: marketData,
    isLoading,
    refetch: refetchMarket,
  } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getMarket",
    args: [marketIdBigInt],
  });

  // Fetch noId for the market (needed for limit orders and swaps)
  const { data: noId } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getNoId",
    args: [marketIdBigInt],
  });

  // Fetch pool state for reserves (needed for odds calculation)
  const { data: poolState } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getPoolState",
    args: [marketIdBigInt, DEFAULT_FEE_OR_HOOK],
  });

  // Fetch user positions
  const { data: userPositions } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getUserPositions",
    args: address ? [address, 0n, 100n] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Fetch orderbook for the current side (YES/NO)
  const { orderbook, isLoading: isOrderbookLoading } = useMarketOrderbook({
    marketId: marketIdBigInt,
    isYes,
    enabled: !!marketData && !marketData[2], // Only if not resolved
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <div className="flex justify-center items-center py-12">
          <LoadingLogo />
        </div>
      </div>
    );
  }

  if (!marketData) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <Button
          variant="ghost"
          onClick={() => navigate({ to: "/predict" })}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Markets
        </Button>
        <div className="text-center py-12">
          <Heading level={3}>Market not found</Heading>
          <p className="text-muted-foreground mt-2">
            This market may have been removed or doesn't exist.
          </p>
        </div>
      </div>
    );
  }

  // Extract market data from getMarket response
  // PAMM returns: (resolver, collateral, resolved, outcome, canClose, close, collateralLocked, yesSupply, noSupply, description)
  const resolver = marketData[0] as string;
  const resolved = marketData[2] as boolean;
  const outcome = marketData[3] as boolean;
  const pot = marketData[6] as bigint;
  const yesSupply = marketData[7] as bigint;
  const noSupply = marketData[8] as bigint;
  const description = marketData[9] as string;
  const payoutPerShare = 0n;

  // Get pool reserves
  const rYes = poolState?.[0];
  const rNo = poolState?.[1];

  // Calculate AMM price from reserves
  const ammPrice =
    rYes && rNo && rYes + rNo > 0n
      ? Number(rNo) / Number(rYes + rNo)
      : undefined;

  // Find user positions for this market
  let userYesBalance = 0n;
  let userNoBalance = 0n;
  let userClaimable = 0n;
  if (userPositions) {
    const userIdx = (userPositions[0] as bigint[]).findIndex(
      (id) => id === marketIdBigInt
    );
    if (userIdx >= 0) {
      userYesBalance = (userPositions[3] as bigint[])[userIdx] || 0n;
      userNoBalance = (userPositions[4] as bigint[])[userIdx] || 0n;
      userClaimable = (userPositions[5] as bigint[])[userIdx] || 0n;
    }
  }

  const tradingOpen = !resolved;

  const handleTradeSuccess = () => {
    refetchMarket();
  };

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-6">
      <Button
        variant="ghost"
        onClick={() => navigate({ to: "/predict" })}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Markets
      </Button>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Market Card (full width on mobile) */}
        <div className="lg:col-span-2">
          <MarketCard
            marketId={marketIdBigInt}
            yesSupply={yesSupply}
            noSupply={noSupply}
            resolver={resolver}
            resolved={resolved}
            outcome={outcome}
            pot={pot}
            payoutPerShare={payoutPerShare}
            description={description}
            userYesBalance={userYesBalance}
            userNoBalance={userNoBalance}
            userClaimable={userClaimable}
            rYes={rYes}
            rNo={rNo}
            onClaimSuccess={handleTradeSuccess}
          />
        </div>

        {/* Right: Trading Panel */}
        <div className="space-y-4">
          {tradingOpen && noId ? (
            <>
              {/* YES/NO Toggle */}
              <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsYes(true)}
                  className={cn(
                    "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
                    isYes
                      ? "bg-green-500 text-white shadow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  YES
                </button>
                <button
                  type="button"
                  onClick={() => setIsYes(false)}
                  className={cn(
                    "flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all",
                    !isYes
                      ? "bg-red-500 text-white shadow"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  NO
                </button>
              </div>

              {/* Trading Tabs */}
              <Tabs
                value={tradeTab}
                onValueChange={(v) =>
                  setTradeTab(v as "market" | "limit" | "swap")
                }
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="market" className="gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Market</span>
                  </TabsTrigger>
                  <TabsTrigger value="limit" className="gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Limit</span>
                  </TabsTrigger>
                  <TabsTrigger value="swap" className="gap-1.5">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Swap</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="market" className="mt-4">
                  <div className="p-4 rounded-lg border border-border bg-card space-y-4">
                    {/* Current odds display */}
                    <div className="text-center space-y-2">
                      <p className="text-sm text-muted-foreground">
                        Current {isYes ? "YES" : "NO"} Price
                      </p>
                      <p className="text-3xl font-bold">
                        {ammPrice !== undefined
                          ? `${((isYes ? ammPrice : 1 - ammPrice) * 100).toFixed(1)}%`
                          : "—"}
                      </p>
                      {rYes !== undefined && rNo !== undefined && (
                        <p className="text-xs text-muted-foreground">
                          Pool: {Number(formatEther(rYes)).toFixed(2)} YES /{" "}
                          {Number(formatEther(rNo)).toFixed(2)} NO
                        </p>
                      )}
                    </div>

                    {/* Trade buttons */}
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        size="lg"
                        className="bg-green-500 hover:bg-green-600 text-white"
                        onClick={() => {
                          setIsYes(true);
                          setIsTradeModalOpen(true);
                        }}
                      >
                        Buy YES
                      </Button>
                      <Button
                        size="lg"
                        className="bg-red-500 hover:bg-red-600 text-white"
                        onClick={() => {
                          setIsYes(false);
                          setIsTradeModalOpen(true);
                        }}
                      >
                        Buy NO
                      </Button>
                    </div>

                    {/* User positions */}
                    {(userYesBalance > 0n || userNoBalance > 0n) && (
                      <div className="pt-3 border-t border-border">
                        <p className="text-xs text-muted-foreground mb-2">
                          Your Positions
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {userYesBalance > 0n && (
                            <div className="flex justify-between">
                              <span className="text-green-500">YES</span>
                              <span className="font-mono">
                                {Number(formatEther(userYesBalance)).toFixed(4)}
                              </span>
                            </div>
                          )}
                          {userNoBalance > 0n && (
                            <div className="flex justify-between">
                              <span className="text-red-500">NO</span>
                              <span className="font-mono">
                                {Number(formatEther(userNoBalance)).toFixed(4)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="limit" className="mt-4">
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <LimitOrderForm
                      marketId={marketIdBigInt}
                      isYes={isYes}
                      noId={noId}
                      onSuccess={handleTradeSuccess}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="swap" className="mt-4">
                  <div className="p-4 rounded-lg border border-border bg-card">
                    <SwapSharesForm
                      marketId={marketIdBigInt}
                      noId={noId}
                      onSuccess={handleTradeSuccess}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {/* Orderbook */}
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
                  <ListOrdered className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {isYes ? "YES" : "NO"} Orderbook
                  </span>
                </div>
                <div className="p-2">
                  <OrderbookDisplay
                    orderbook={orderbook}
                    isLoading={isOrderbookLoading}
                    maxRows={6}
                    compact
                    ammPrice={ammPrice}
                  />
                </div>
              </div>

              {/* User's Orders */}
              {address && (
                <div className="rounded-lg border border-border bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/30">
                    <span className="text-sm font-medium">Your Orders</span>
                  </div>
                  <div className="p-3">
                    <UserOrdersList
                      marketId={marketIdBigInt}
                      onOrderCancelled={handleTradeSuccess}
                      compact
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="p-6 rounded-lg border border-border bg-card text-center">
              <p className="text-muted-foreground">
                {resolved
                  ? `Market resolved: ${outcome ? "YES" : "NO"} won`
                  : "Trading is closed for this market"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Trade Modal */}
      <TradeModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        marketId={marketIdBigInt}
        marketName={description}
        yesSupply={yesSupply}
        noSupply={noSupply}
        resolver={resolver}
        initialPosition={isYes ? "yes" : "no"}
        onTransactionSuccess={handleTradeSuccess}
      />
    </div>
  );
};

// Wrap with error boundary for better error handling
export const MarketDetailPage: React.FC<MarketDetailPageProps> = (props) => {
  return (
    <PredictErrorBoundary>
      <MarketDetailPageContent {...props} />
    </PredictErrorBoundary>
  );
};
