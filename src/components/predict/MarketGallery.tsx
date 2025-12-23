import React, { useState, useEffect, useMemo } from "react";
import { useReadContract, useReadContracts, useAccount } from "wagmi";
import {
  PAMMSingletonAddress,
  PAMMSingletonAbi,
  decodeMarketState,
  DEFAULT_FEE_OR_HOOK,
} from "@/constants/PAMMSingleton";
import { MarketCard } from "./MarketCard";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, X, TrendingUp, Clock, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isResolverSingleton,
  getMarketCategory,
  CATEGORY_INFO,
  type MarketCategory,
} from "@/constants/TrustedResolvers";

interface MarketGalleryProps {
  refreshKey?: number;
}

// Category-based filtering for onchain event markets
type MarketFilter =
  | "all"
  | "governance" // DAO voting & proposals
  | "price" // Asset prices
  | "balance" // Token/NFT holdings
  | "network" // Gas & network metrics
  | "supply" // Token supply
  | "protocol" // Protocol events
  | "random" // Games
  | "custom" // User-created
  | "oracle" // All Resolver singleton markets (gold badge)
  | "closed"
  | "resolved"
  | "positions"
  | "favorites";
type SortOption = "newest" | "pot" | "activity" | "closing";

export const MarketGallery: React.FC<MarketGalleryProps> = ({ refreshKey }) => {
  const [start] = useState(0);
  const [filter, setFilter] = useState<MarketFilter>("all");
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

  // Fetch PAMM markets with real-time updates
  const {
    data: pammMarketsData,
    isLoading: isLoadingPAMM,
    refetch: refetchPAMM,
  } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
    query: {
      refetchInterval: 15000, // Poll every 15 seconds for real-time updates
    },
  });

  // Get user positions for PAMM if connected
  const { data: userPammPositionsData, refetch: refetchUserDataPAMM } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getUserPositions",
    args: address ? [address, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // Batch read trading status for PAMM markets
  const pammMarketIds = pammMarketsData?.[0] || [];
  type TradingOpenResult = { result?: boolean; status: string };
  const { data: pammTradingOpenDataRaw, isLoading: isLoadingPAMMTrading } = useReadContracts({
    contracts: pammMarketIds.map((marketId) => ({
      address: PAMMSingletonAddress,
      abi: PAMMSingletonAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: pammMarketIds.length > 0,
    },
  });
  const pammTradingOpenData = pammTradingOpenDataRaw as TradingOpenResult[] | undefined;

  // Batch read pool state for PAMM markets to get reserves for odds calculation
  type PoolStateResult = { result?: readonly [bigint, bigint, bigint, bigint]; status: string };
  const { data: pammPoolStatesRaw, isLoading: isLoadingPAMMPools } = useReadContracts({
    contracts: pammMarketIds.map((marketId) => ({
      address: PAMMSingletonAddress,
      abi: PAMMSingletonAbi,
      functionName: "getPoolState",
      args: [marketId, DEFAULT_FEE_OR_HOOK],
    })),
    query: {
      enabled: pammMarketIds.length > 0,
    },
  });
  const pammPoolStates = pammPoolStatesRaw as PoolStateResult[] | undefined;

  const isLoading = isLoadingPAMM || isLoadingPAMMTrading || isLoadingPAMMPools;

  useEffect(() => {
    if (refreshKey !== undefined) {
      refetchPAMM();
      if (address) {
        refetchUserDataPAMM();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const hasPAMMMarkets = Boolean(pammMarketsData && pammMarketsData[0] && pammMarketsData[0].length > 0);

  // Parse PAMM markets - new format with packed states
  // getMarkets returns: marketIds[], resolvers[], collaterals[], states[], closes[], collateralAmounts[], yesSupplies[], noSupplies[], descs[], next
  const pammMarkets = useMemo(
    () =>
      hasPAMMMarkets
        ? {
            marketIdsArray: pammMarketsData![0],
            resolvers: pammMarketsData![1],
            collaterals: pammMarketsData![2],
            states: pammMarketsData![3], // uint8[] - packed (resolved, outcome, canClose)
            closes: pammMarketsData![4],
            collateralAmounts: pammMarketsData![5], // pot equivalent
            yesSupplies: pammMarketsData![6],
            noSupplies: pammMarketsData![7],
            descs: pammMarketsData![8],
            next: pammMarketsData![9],
          }
        : null,
    [hasPAMMMarkets, pammMarketsData],
  );

  // getUserPositions returns: marketIds[], noIds[], collaterals[], yesBalances[], noBalances[], claimables[], isResolved[], isOpen[], next
  const userPammPositions = useMemo(
    () =>
      userPammPositionsData
        ? {
            marketIds: userPammPositionsData[0],
            yesBalances: userPammPositionsData[3],
            noBalances: userPammPositionsData[4],
            claimables: userPammPositionsData[5],
          }
        : null,
    [userPammPositionsData],
  );

  // Build markets array from PAMM data
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
      contractAddress: `0x${string}`;
      rYes?: bigint;
      rNo?: bigint;
      category: MarketCategory; // Market category for filtering
      isOracleMarket: boolean; // True if uses Resolver singleton (gold badge)
    }> = [];

    // Add PAMM markets
    if (pammMarkets) {
      pammMarkets.marketIdsArray.forEach((marketId: bigint, idx: number) => {
        // Decode packed state: (resolved ? 1 : 0) | (outcome ? 2 : 0) | (canClose ? 4 : 0)
        const state = decodeMarketState(pammMarkets.states[idx]);

        // Get pool reserves from separate getPoolState call
        // getPoolState returns: [rYes, rNo, pYesNum, pYesDen]
        const poolState = pammPoolStates?.[idx]?.result;

        // Find user position for this market (getUserPositions returns by index, need to match by marketId)
        let userYesBal = 0n;
        let userNoBal = 0n;
        let userClaim = 0n;
        if (userPammPositions) {
          const userIdx = userPammPositions.marketIds.findIndex((id: bigint) => id === marketId);
          if (userIdx >= 0) {
            userYesBal = userPammPositions.yesBalances[userIdx] || 0n;
            userNoBal = userPammPositions.noBalances[userIdx] || 0n;
            userClaim = userPammPositions.claimables[userIdx] || 0n;
          }
        }

        const resolverAddr = pammMarkets.resolvers[idx];
        const desc = pammMarkets.descs[idx];

        markets.push({
          marketId,
          yesSupply: pammMarkets.yesSupplies[idx],
          noSupply: pammMarkets.noSupplies[idx],
          resolver: resolverAddr,
          resolved: state.resolved,
          outcome: state.outcome,
          pot: pammMarkets.collateralAmounts[idx],
          payoutPerShare: 0n, // Calculated on-the-fly in the new contract
          description: desc,
          userYesBalance: userYesBal,
          userNoBalance: userNoBal,
          userClaimable: userClaim,
          tradingOpen: Boolean(pammTradingOpenData?.[idx]?.result ?? true),
          contractAddress: PAMMSingletonAddress,
          rYes: poolState?.[0],
          rNo: poolState?.[1],
          category: getMarketCategory(resolverAddr, desc),
          isOracleMarket: isResolverSingleton(resolverAddr),
        });
      });
    }

    return markets;
  }, [
    pammMarkets,
    userPammPositions,
    // Use BigInt-safe serialization to avoid deep type instantiation
    // eslint-disable-next-line react-hooks/exhaustive-deps
    pammTradingOpenData
      ?.map((d) => d.result?.toString())
      .join(","),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    pammPoolStates
      ?.map((d) => d.result?.map((v) => v?.toString()).join("-"))
      .join(","),
  ]);

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

  // Category counts for active markets
  const categoryCounts = useMemo(() => {
    const counts: Record<MarketCategory | "oracle", number> = {
      governance: 0,
      price: 0,
      balance: 0,
      network: 0,
      supply: 0,
      protocol: 0,
      random: 0,
      custom: 0,
      oracle: 0,
    };

    activeMarkets.forEach((m) => {
      counts[m.category]++;
      if (m.isOracleMarket) {
        counts.oracle++;
      }
    });

    return counts;
  }, [activeMarkets]);

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
      // Status filters
      if (filter === "all") {
        return market.tradingOpen && !market.resolved; // Show all active
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

      // Oracle filter (Resolver singleton - gold badge markets)
      if (filter === "oracle") {
        return market.tradingOpen && !market.resolved && market.isOracleMarket;
      }

      // Category filters (only show active markets in category)
      const categoryFilters: MarketCategory[] = [
        "governance",
        "price",
        "balance",
        "network",
        "supply",
        "protocol",
        "random",
        "custom",
      ];
      if (categoryFilters.includes(filter as MarketCategory)) {
        return market.tradingOpen && !market.resolved && market.category === filter;
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

  // Calculate total markets count
  const totalMarketsCount = hasPAMMMarkets ? pammMarketsData![0].length : 0;

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
  if (!hasPAMMMarkets) {
    return (
      <div className="text-center py-12 text-muted-foreground">No prediction markets yet. Create the first one!</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Total Markets Count Header */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">{totalMarketsCount}</span> PAMM markets
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
          <TabsList className="inline-flex w-auto min-w-full gap-1">
            {/* All Active Markets */}
            <TabsTrigger value="all" className="whitespace-nowrap">
              <span className="hidden sm:inline">All ({activeMarkets.length})</span>
              <span className="sm:hidden">All</span>
            </TabsTrigger>

            {/* Oracle Markets (Resolver Singleton - Gold Badge) */}
            {categoryCounts.oracle > 0 && (
              <TabsTrigger value="oracle" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span className="text-amber-500">*</span>
                  <span className="hidden sm:inline">Oracle ({categoryCounts.oracle})</span>
                  <span className="sm:hidden">Oracle</span>
                </span>
              </TabsTrigger>
            )}

            {/* Category Tabs - Only show if category has markets */}
            {categoryCounts.price > 0 && (
              <TabsTrigger value="price" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.price.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.price.label} ({categoryCounts.price})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.price.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.governance > 0 && (
              <TabsTrigger value="governance" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.governance.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.governance.label} ({categoryCounts.governance})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.governance.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.balance > 0 && (
              <TabsTrigger value="balance" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.balance.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.balance.label} ({categoryCounts.balance})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.balance.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.network > 0 && (
              <TabsTrigger value="network" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.network.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.network.label} ({categoryCounts.network})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.network.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.supply > 0 && (
              <TabsTrigger value="supply" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.supply.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.supply.label} ({categoryCounts.supply})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.supply.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.protocol > 0 && (
              <TabsTrigger value="protocol" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.protocol.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.protocol.label} ({categoryCounts.protocol})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.protocol.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.random > 0 && (
              <TabsTrigger value="random" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.random.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.random.label} ({categoryCounts.random})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.random.label}</span>
                </span>
              </TabsTrigger>
            )}
            {categoryCounts.custom > 0 && (
              <TabsTrigger value="custom" className="whitespace-nowrap">
                <span className="flex items-center gap-1">
                  <span>{CATEGORY_INFO.custom.icon}</span>
                  <span className="hidden sm:inline">
                    {CATEGORY_INFO.custom.label} ({categoryCounts.custom})
                  </span>
                  <span className="sm:hidden">{CATEGORY_INFO.custom.label}</span>
                </span>
              </TabsTrigger>
            )}

            {/* Separator */}
            <div className="w-px h-6 bg-border mx-1 self-center" />

            {/* Status filters */}
            {favoritesCount > 0 && (
              <TabsTrigger value="favorites" className="whitespace-nowrap">
                <span className="hidden sm:inline">Favorites ({favoritesCount})</span>
                <span className="sm:hidden">Favs</span>
              </TabsTrigger>
            )}
            {address && positionsCount > 0 && (
              <TabsTrigger value="positions" className="whitespace-nowrap">
                <span className="hidden sm:inline">My Positions ({positionsCount})</span>
                <span className="sm:hidden">Mine</span>
              </TabsTrigger>
            )}
            {closedCount > 0 && (
              <TabsTrigger value="closed" className="whitespace-nowrap text-muted-foreground">
                <span className="hidden sm:inline">Closed ({closedCount})</span>
                <span className="sm:hidden">Closed</span>
              </TabsTrigger>
            )}
            {resolvedCount > 0 && (
              <TabsTrigger value="resolved" className="whitespace-nowrap text-muted-foreground">
                <span className="hidden sm:inline">Resolved ({resolvedCount})</span>
                <span className="sm:hidden">Done</span>
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
            <div className="space-y-5">
              {/* Markets Grid */}
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
                    contractAddress={market.contractAddress}
                    rYes={market.rYes}
                    rNo={market.rNo}
                    category={market.category}
                    isOracleMarket={market.isOracleMarket}
                    onClaimSuccess={() => {
                      refetchPAMM();
                      if (address) {
                        refetchUserDataPAMM();
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
