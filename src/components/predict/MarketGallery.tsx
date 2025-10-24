import React, { useState, useEffect, useMemo } from "react";
import { useReadContract, useReadContracts, useAccount } from "wagmi";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAddress, PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { MarketCard } from "./MarketCard";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, X, TrendingUp, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isTrustedResolver, isPerpetualOracleResolver } from "@/constants/TrustedResolvers";

interface MarketGalleryProps {
  refreshKey?: number;
}

type MarketFilter = "all" | "contract" | "curated" | "community" | "closed" | "resolved" | "positions" | "favorites";
type SortOption = "newest" | "pot" | "activity" | "closing";

export const MarketGallery: React.FC<MarketGalleryProps> = ({ refreshKey }) => {
  const [start] = useState(0);
  const [filter, setFilter] = useState<MarketFilter>("curated");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [favoritesVersion, setFavoritesVersion] = useState(0); // Force re-render when favorites change
  // Fetch 100 markets per contract (200 total). Balance between completeness and performance.
  // TODO: Implement pagination or infinite scroll when market count grows significantly
  const count = 100;
  const { address } = useAccount();

  // Listen for favorite toggle events
  useEffect(() => {
    const handleFavoriteToggle = () => {
      setFavoritesVersion((v) => v + 1);
    };
    window.addEventListener("favoriteToggled", handleFavoriteToggle);
    return () => window.removeEventListener("favoriteToggled", handleFavoriteToggle);
  }, []);

  // Debounce search input for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Pari-Mutuel markets with real-time updates
  const {
    data: marketsData,
    isLoading: isLoadingPM,
    refetch: refetchPM,
  } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
    query: {
      refetchInterval: 15000, // Poll every 15 seconds for real-time updates
    },
  });

  // Fetch AMM markets with real-time updates
  const {
    data: ammMarketsData,
    isLoading: isLoadingAMM,
    refetch: refetchAMM,
  } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
    query: {
      refetchInterval: 15000, // Poll every 15 seconds for real-time updates
    },
  });

  // Get user positions for Pari-Mutuel if connected
  const { data: userMarketsData, refetch: refetchUserDataPM } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getUserMarkets",
    args: address ? [address, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Get user positions for AMM if connected
  const { data: userAmmMarketsData, refetch: refetchUserDataAMM } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getUserMarkets",
    args: address ? [address, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Batch read trading status for Pari-Mutuel markets
  const marketIds = marketsData?.[0] || [];
  const { data: tradingOpenData, isLoading: isLoadingPMTrading } = useReadContracts({
    contracts: marketIds.map((marketId) => ({
      address: PredictionMarketAddress as `0x${string}`,
      abi: PredictionMarketAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: marketIds.length > 0,
    },
  });

  // Batch read trading status for AMM markets
  const ammMarketIds = ammMarketsData?.[0] || [];
  const { data: ammTradingOpenData, isLoading: isLoadingAMMTrading } = useReadContracts({
    contracts: ammMarketIds.map((marketId) => ({
      address: PredictionAMMAddress as `0x${string}`,
      abi: PredictionAMMAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: ammMarketIds.length > 0,
    },
  });

  const isLoading = isLoadingPM || isLoadingAMM || isLoadingPMTrading || isLoadingAMMTrading;

  useEffect(() => {
    if (refreshKey !== undefined) {
      refetchPM();
      refetchAMM();
      if (address) {
        refetchUserDataPM();
        refetchUserDataAMM();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const hasPMMarkets = Boolean(marketsData && marketsData[0] && marketsData[0].length > 0);
  const hasAMMMarkets = Boolean(ammMarketsData && ammMarketsData[0] && ammMarketsData[0].length > 0);

  // Parse Pari-Mutuel markets (memoized to ensure consistent hook calls)
  const pmMarkets = useMemo(
    () =>
      hasPMMarkets
        ? {
            marketIdsArray: marketsData![0],
            yesSupplies: marketsData![1],
            noSupplies: marketsData![2],
            resolvers: marketsData![3],
            resolved: marketsData![4],
            outcome: marketsData![5],
            pot: marketsData![6],
            payoutPerShare: marketsData![7],
            descs: marketsData![8],
            next: marketsData![9],
          }
        : null,
    [hasPMMarkets, marketsData],
  );

  // Parse AMM markets - note the AMM contract returns more fields
  const ammMarkets = useMemo(
    () =>
      hasAMMMarkets
        ? {
            marketIdsArray: ammMarketsData![0],
            yesSupplies: ammMarketsData![1],
            noSupplies: ammMarketsData![2],
            resolvers: ammMarketsData![3],
            resolved: ammMarketsData![4],
            outcome: ammMarketsData![5],
            pot: ammMarketsData![6],
            payoutPerShare: ammMarketsData![7],
            descs: ammMarketsData![8],
            closes: ammMarketsData![9],
            canCloses: ammMarketsData![10],
            rYesArr: ammMarketsData![11],
            rNoArr: ammMarketsData![12],
            pYesNumArr: ammMarketsData![13],
            pYesDenArr: ammMarketsData![14],
            next: ammMarketsData![15],
          }
        : null,
    [hasAMMMarkets, ammMarketsData],
  );

  // Extract user positions data for both types
  const userPositions = useMemo(
    () =>
      userMarketsData
        ? {
            yesBalances: userMarketsData[2],
            noBalances: userMarketsData[3],
            claimables: userMarketsData[4],
          }
        : null,
    [userMarketsData],
  );

  const userAmmPositions = useMemo(
    () =>
      userAmmMarketsData
        ? {
            yesBalances: userAmmMarketsData[2],
            noBalances: userAmmMarketsData[3],
            claimables: userAmmMarketsData[4],
          }
        : null,
    [userAmmMarketsData],
  );

  // Combine markets from both contracts (memoized to ensure consistent hook calls)
  const allMarkets = useMemo(() => {
    const markets: Array<{
      marketId: bigint;
      yesSupply: bigint;
      noSupply: bigint;
      resolver: string;
      resolved: boolean;
      outcome: boolean;
      pot: bigint;
      payoutPerShare: bigint;
      description: string;
      userYesBalance: bigint;
      userNoBalance: bigint;
      userClaimable: bigint;
      tradingOpen: boolean;
      marketType: "parimutuel" | "amm";
      contractAddress: `0x${string}`;
      rYes?: bigint;
      rNo?: bigint;
    }> = [];

    // Add Pari-Mutuel markets
    if (pmMarkets) {
      pmMarkets.marketIdsArray.forEach((marketId, idx) => {
        markets.push({
          marketId,
          yesSupply: pmMarkets.yesSupplies[idx],
          noSupply: pmMarkets.noSupplies[idx],
          resolver: pmMarkets.resolvers[idx],
          resolved: pmMarkets.resolved[idx],
          outcome: pmMarkets.outcome[idx],
          pot: pmMarkets.pot[idx],
          payoutPerShare: pmMarkets.payoutPerShare[idx],
          description: pmMarkets.descs[idx],
          userYesBalance: userPositions?.yesBalances[idx] || 0n,
          userNoBalance: userPositions?.noBalances[idx] || 0n,
          userClaimable: userPositions?.claimables[idx] || 0n,
          tradingOpen: Boolean(tradingOpenData?.[idx]?.result ?? true),
          marketType: "parimutuel",
          contractAddress: PredictionMarketAddress as `0x${string}`,
        });
      });
    }

    // Add AMM markets
    if (ammMarkets) {
      ammMarkets.marketIdsArray.forEach((marketId, idx) => {
        markets.push({
          marketId,
          yesSupply: ammMarkets.yesSupplies[idx],
          noSupply: ammMarkets.noSupplies[idx],
          resolver: ammMarkets.resolvers[idx],
          resolved: ammMarkets.resolved[idx],
          outcome: ammMarkets.outcome[idx],
          pot: ammMarkets.pot[idx],
          payoutPerShare: ammMarkets.payoutPerShare[idx],
          description: ammMarkets.descs[idx],
          userYesBalance: userAmmPositions?.yesBalances[idx] || 0n,
          userNoBalance: userAmmPositions?.noBalances[idx] || 0n,
          userClaimable: userAmmPositions?.claimables[idx] || 0n,
          tradingOpen: Boolean(ammTradingOpenData?.[idx]?.result ?? true),
          marketType: "amm",
          contractAddress: PredictionAMMAddress as `0x${string}`,
          rYes: ammMarkets.rYesArr[idx],
          rNo: ammMarkets.rNoArr[idx],
        });
      });
    }

    return markets;
  }, [pmMarkets, ammMarkets, userPositions, userAmmPositions, tradingOpenData, ammTradingOpenData]);

  // Excluded resolver addresses
  const excludedResolvers = useMemo(
    () =>
      new Set([
        "0x40cc6F9ca737a0aA746b645cFc92a67942162CC3".toLowerCase(),
        "0x07e53dd08D9579e90928636068835d4EADc253a6".toLowerCase(), // Old CoinflipResolver (excluded)
        // Note: 0xeAd4D6A7C5C0D8ff7bFbe3ab1b4b4bc596C1FD1c is the NEW trusted CoinflipResolver and should be visible
      ]),
    [],
  );

  // Excluded market IDs (specific Coinflip markets to hide)
  const excludedMarketIds = useMemo(
    () =>
      new Set([
        54729014062189984233222064350194783449228335005152376603700161212069844720568n,
        26201201871669602142649258403946775672767689279764719138083439927528646678749n,
        2432527491801219314479643753245417709526518743184029612039853322401478992262n,
      ]),
    [],
  );

  // Memoize expensive filtering operations
  const visibleMarkets = useMemo(
    () =>
      allMarkets.filter((m) => !excludedResolvers.has(m.resolver.toLowerCase()) && !excludedMarketIds.has(m.marketId)),
    [allMarkets, excludedResolvers, excludedMarketIds],
  );

  // Define dust threshold: 0.0001 wstETH (100000000000000 wei = 10^14)
  // Markets below this amount when closed/resolved are considered "dust" and hidden
  const DUST_THRESHOLD = 100000000000000n; // 0.0001 wstETH

  // First, filter out dust markets from closed/resolved
  const nonDustMarkets = useMemo(
    () =>
      visibleMarkets.filter((market) => {
        // Always keep active markets regardless of pot size
        // This includes parimutuel markets with pot === 0 that haven't been initialized yet
        if (market.tradingOpen && !market.resolved) {
          return true;
        }

        // For resolved markets: only keep if pot >= DUST_THRESHOLD
        if (market.resolved) {
          return market.pot >= DUST_THRESHOLD;
        }

        // For closed but unresolved markets:
        // - Only keep if pot >= DUST_THRESHOLD (meaningful amounts)
        // - Hide if pot is 0 (no activity) or pot < DUST_THRESHOLD (dust amounts)
        return market.pot >= DUST_THRESHOLD;
      }),
    [visibleMarkets, DUST_THRESHOLD],
  );

  // Calculate accurate counts based on non-dust markets
  const activeMarkets = nonDustMarkets.filter((m) => m.tradingOpen && !m.resolved);
  const contractCount = activeMarkets.filter((m) => isPerpetualOracleResolver(m.resolver)).length;
  const curatedCount = activeMarkets.filter(
    (m) => isTrustedResolver(m.resolver) && !isPerpetualOracleResolver(m.resolver),
  ).length;
  const communityCount = activeMarkets.filter((m) => !isTrustedResolver(m.resolver)).length;
  const closedCount = nonDustMarkets.filter((m) => !m.tradingOpen && !m.resolved).length;
  const resolvedCount = nonDustMarkets.filter((m) => m.resolved).length;
  const positionsCount = nonDustMarkets.filter((m) => m.userYesBalance > 0n || m.userNoBalance > 0n).length;

  // Get favorites from localStorage
  const favorites = useMemo(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("favoriteMarkets") || "[]"));
    } catch {
      return new Set();
    }
  }, [favoritesVersion]); // Re-read when favorites change
  const favoritesCount = nonDustMarkets.filter((m) => favorites.has(m.marketId.toString())).length;

  // Filter markets based on selected filter and search query (memoized for performance)
  const filteredMarkets = useMemo(() => {
    let markets = nonDustMarkets.filter((market) => {
      if (filter === "all") {
        return true;
      }
      if (filter === "contract") {
        return market.tradingOpen && !market.resolved && isPerpetualOracleResolver(market.resolver);
      }
      if (filter === "curated") {
        return (
          market.tradingOpen &&
          !market.resolved &&
          isTrustedResolver(market.resolver) &&
          !isPerpetualOracleResolver(market.resolver)
        );
      }
      if (filter === "community") {
        return market.tradingOpen && !market.resolved && !isTrustedResolver(market.resolver);
      }
      if (filter === "closed") {
        return !market.tradingOpen && !market.resolved;
      }
      if (filter === "resolved") {
        return market.resolved;
      }
      if (filter === "positions") {
        return market.userYesBalance > 0n || market.userNoBalance > 0n;
      }
      if (filter === "favorites") {
        return favorites.has(market.marketId.toString());
      }
      return true;
    });

    // Apply search filter if query exists
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      markets = markets.filter((market) => {
        // Search in description or market ID
        const descLower = market.description.toLowerCase();
        return descLower.includes(query) || market.marketId.toString().includes(query);
      });
    }

    // Apply sorting
    const sorted = [...markets].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          // Newest markets have higher IDs
          return Number(b.marketId - a.marketId);
        case "pot":
          // Highest pot first
          return Number(b.pot - a.pot);
        case "activity":
          // Markets with more total shares (activity)
          const aActivity = a.yesSupply + a.noSupply;
          const bActivity = b.yesSupply + b.noSupply;
          return Number(bActivity - aActivity);
        case "closing":
          // Active markets only, no closing time for parimutuel
          // For now, same as newest
          return Number(b.marketId - a.marketId);
        default:
          return 0;
      }
    });

    return sorted;
  }, [nonDustMarkets, filter, debouncedSearchQuery, sortBy, favorites]);

  // Calculate total markets count (before exclusions, just PM + AMM)
  const totalPMMarkets = hasPMMarkets ? marketsData![0].length : 0;
  const totalAMMMarkets = hasAMMMarkets ? ammMarketsData![0].length : 0;
  const totalMarketsCount = totalPMMarkets + totalAMMMarkets;

  // Skeleton loader component
  const MarketCardSkeleton = () => (
    <div className="bg-card border border-border rounded-xl overflow-hidden animate-pulse">
      <div className="w-full h-40 bg-muted" />
      <div className="p-5 space-y-4">
        <div className="space-y-2">
          <div className="h-4 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
        </div>
        <div className="h-20 bg-muted rounded" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 bg-muted rounded" />
          <div className="h-14 bg-muted rounded" />
        </div>
      </div>
    </div>
  );

  // Handle loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-8">
          <LoadingLogo />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <MarketCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Handle empty state
  if (!hasPMMarkets && !hasAMMMarkets) {
    return (
      <div className="text-center py-12 text-muted-foreground">No prediction markets yet. Create the first one!</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total Markets Count Header */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">{totalMarketsCount}</span> total markets
          <span className="hidden sm:inline">
            {" "}
            ({totalPMMarkets} Parimutuel, {totalAMMMarkets} AMM)
          </span>
        </div>
        {nonDustMarkets.length < visibleMarkets.length && (
          <div className="text-xs opacity-75">
            Hiding {visibleMarkets.length - nonDustMarkets.length} finished markets
          </div>
        )}
      </div>

      {/* Search and Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md mx-auto sm:mx-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search markets by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 h-11 bg-muted/30 border-border/50 focus:bg-background transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          {searchQuery !== debouncedSearchQuery && (
            <div className="absolute right-10 top-1/2 -translate-y-1/2">
              <div className="h-3 w-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Sort Dropdown */}
        <div className="flex gap-2 justify-center sm:justify-start flex-wrap">
          <Button
            variant={sortBy === "newest" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("newest")}
            className="h-11 gap-2"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Newest</span>
          </Button>
          <Button
            variant={sortBy === "pot" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("pot")}
            className="h-11 gap-2"
          >
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Highest Pot</span>
          </Button>
          <Button
            variant={sortBy === "activity" ? "default" : "outline"}
            size="sm"
            onClick={() => setSortBy("activity")}
            className="h-11 gap-2"
          >
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Most Active</span>
          </Button>
        </div>
      </div>

      {/* Show search results count when searching */}
      {debouncedSearchQuery && (
        <div className="text-center text-sm text-muted-foreground animate-in fade-in duration-200">
          Found <span className="font-semibold text-foreground">{filteredMarkets.length}</span> market
          {filteredMarkets.length !== 1 ? "s" : ""} matching "{debouncedSearchQuery}"
        </div>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as MarketFilter)}>
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-auto min-w-full">
            {favoritesCount > 0 && (
              <TabsTrigger value="favorites" className="whitespace-nowrap">
                <span className="hidden sm:inline">Favorites ({favoritesCount})</span>
                <span className="sm:hidden">Favorites</span>
              </TabsTrigger>
            )}
            {curatedCount > 0 && (
              <TabsTrigger value="curated" className="whitespace-nowrap">
                <span className="hidden sm:inline">Curated ({curatedCount})</span>
                <span className="sm:hidden">Curated</span>
              </TabsTrigger>
            )}
            {contractCount > 0 && (
              <TabsTrigger value="contract" className="whitespace-nowrap">
                <span className="hidden sm:inline">Contract ({contractCount})</span>
                <span className="sm:hidden">Contract</span>
              </TabsTrigger>
            )}
            {communityCount > 0 && (
              <TabsTrigger value="community" className="whitespace-nowrap">
                <span className="hidden sm:inline">Community ({communityCount})</span>
                <span className="sm:hidden">Community</span>
              </TabsTrigger>
            )}
            {closedCount > 0 && (
              <TabsTrigger value="closed" className="whitespace-nowrap">
                <span className="hidden sm:inline">Closed ({closedCount})</span>
                <span className="sm:hidden">Closed</span>
              </TabsTrigger>
            )}
            {resolvedCount > 0 && (
              <TabsTrigger value="resolved" className="whitespace-nowrap">
                <span className="hidden sm:inline">Resolved ({resolvedCount})</span>
                <span className="sm:hidden">Resolved</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="all" className="whitespace-nowrap">
              <span className="hidden sm:inline">All ({nonDustMarkets.length})</span>
              <span className="sm:hidden">All</span>
            </TabsTrigger>
            {address && positionsCount > 0 && (
              <TabsTrigger value="positions" className="whitespace-nowrap">
                <span className="hidden sm:inline">My Positions ({positionsCount})</span>
                <span className="sm:hidden">Mine</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value={filter} className="mt-6">
          {filteredMarkets.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-5xl mb-4 opacity-50">🔍</div>
              <p className="text-muted-foreground text-base">
                {searchQuery
                  ? `No markets found matching "${searchQuery}"`
                  : `No ${filter === "all" ? "" : filter} markets found`}
              </p>
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="mt-4 text-sm text-primary hover:underline">
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in duration-300">
              {filteredMarkets.map((market) => (
                <MarketCard
                  key={`${market.contractAddress}-${market.marketId.toString()}`}
                  marketId={market.marketId}
                  yesSupply={market.yesSupply}
                  noSupply={market.noSupply}
                  resolver={market.resolver}
                  resolved={market.resolved}
                  outcome={market.outcome}
                  pot={market.pot}
                  payoutPerShare={market.payoutPerShare}
                  description={market.description}
                  userYesBalance={market.userYesBalance}
                  userNoBalance={market.userNoBalance}
                  userClaimable={market.userClaimable}
                  marketType={market.marketType}
                  contractAddress={market.contractAddress}
                  rYes={market.rYes}
                  rNo={market.rNo}
                  onClaimSuccess={() => {
                    refetchPM();
                    refetchAMM();
                    if (address) {
                      refetchUserDataPM();
                      refetchUserDataAMM();
                    }
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
