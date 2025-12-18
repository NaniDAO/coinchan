import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PMRouterAddress } from "@/constants/PMRouter";
import { ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { zICOAddress } from "@/constants/zICO";
import { INDEXER_URL } from "@/lib/indexer";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { OrderCard } from "./OrderCard";
import { Button } from "./ui/button"; // Keep existing import path
import { LoadingLogo } from "./ui/loading-logo";

export interface Order {
  id: string; // orderHash
  maker: string;
  tokenIn: string;
  idIn: string;
  amtIn: string;
  tokenOut: string;
  idOut: string;
  amtOut: string;
  // deadline is a unix timestamp in seconds (number)
  deadline: number;
  partialFill: boolean;
  inDone: string;
  outDone: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  txHash: string;
  blockNumber: string;
}

// Define the fetch function outside the component
const fetchAllOrders = async (): Promise<Order[]> => {
  const query = `
    query GetOrders {
      orders(
        orderBy: "createdAt",
        orderDirection: "desc",
        limit: 500
      ) {
        items {
          id
          maker
          tokenIn
          idIn
          amtIn
          tokenOut
          idOut
          amtOut
          deadline
          partialFill
          inDone
          outDone
          status
          createdAt
          updatedAt
          txHash
          blockNumber
        }
      }
    }
  `;

  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    // console.error("HTTP error response:", errorText); // Commenting out console errors unless critical
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }

  const responseText = await response.text();

  const { data, errors } = JSON.parse(responseText);

  if (errors && errors.length > 0) {
    // console.error("GraphQL errors:", errors); // Commenting out console errors unless critical
    throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
  }

  const orders = data?.orders?.items || [];
  return orders;
};

type OrderType = "regular" | "prediction_market";

interface FilterState {
  status: ("ACTIVE" | "COMPLETED" | "CANCELLED")[];
  onlyMine: boolean;
  excludeMine: boolean;
  hideExpired: boolean;
  searchAddress: string;
  orderTypes: OrderType[];
}

const defaultFilters: FilterState = {
  status: ["ACTIVE"], // Default to showing only active orders
  onlyMine: false,
  excludeMine: false,
  hideExpired: true, // Hide expired by default
  searchAddress: "",
  orderTypes: ["regular"], // Default to regular orders only
};

// --- OrderFilterPills component (from prompt) ---
export const OrderFilterPills = ({
  onFilter,
  initialFilters,
}: {
  onFilter: (f: FilterState) => void;
  initialFilters: FilterState;
}) => {
  const { t } = useTranslation();
  const { address } = useAccount(); // Keep useAccount if needed for disabled state or similar

  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters, ...initialFilters });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(initialFilters?.searchAddress ?? "");

  // Use useCallback for updateFilters as it's passed down
  const updateFilters = useCallback(
    (newFilters: Partial<FilterState>) => {
      setFilters((prevFilters) => {
        const updated = { ...prevFilters, ...newFilters };
        onFilter(updated); // Call the parent's callback
        return updated;
      });
      // Close popover after selection? Depends on UX. Let's keep it open for multiple selections.
      // setPopoverOpen(false);
    },
    [onFilter],
  ); // Dependency on onFilter

  // Use useCallback for removeFilter
  const removeFilter = useCallback(
    (key: keyof FilterState, value?: string) => {
      setFilters((prevFilters) => {
        const updated = { ...prevFilters };
        if (key === "status" && value) {
          updated.status = updated.status.filter((s) => s !== value);
        } else if (key === "orderTypes" && value) {
          updated.orderTypes = updated.orderTypes.filter((ot) => ot !== value);
        } else if (key === "searchAddress") {
          updated.searchAddress = "";
          setSearchInput("");
        } else if (key === "hideExpired") {
          updated.hideExpired = false;
        } else {
          // Reset boolean filters
          (updated[key] as boolean) = false;
        }
        onFilter(updated);
        return updated;
      });
    },
    [onFilter],
  );

  const activePills = useMemo(() => {
    const pills: Array<{ label: string; key: string; value?: string }> = [];
    for (const s of filters.status) {
      pills.push({
        label: `${t("orders.status")}: ${t(`orders.${s.toLowerCase()}`)}`,
        key: "status",
        value: s,
      });
    }
    for (const ot of filters.orderTypes) {
      pills.push({
        label: `${t("orders.type")}: ${t(`orders.${ot}`)}`,
        key: "orderTypes",
        value: ot,
      });
    }
    // Only show ownership pills if address is connected
    if (address) {
      if (filters.onlyMine) pills.push({ label: t("orders.only_my_orders"), key: "onlyMine" });
      if (filters.excludeMine) pills.push({ label: t("orders.exclude_my_orders"), key: "excludeMine" });
    }
    if (filters.hideExpired) pills.push({ label: t("orders.hide_expired"), key: "hideExpired" });
    if (filters.searchAddress) {
      pills.push({
        label: `${t("orders.maker")}: ${filters.searchAddress.slice(0, 6)}...${filters.searchAddress.slice(-4)}`,
        key: "searchAddress",
        value: filters.searchAddress,
      });
    }
    return pills;
  }, [filters, t, address]);

  const handleSearch = useCallback(() => {
    if (searchInput.trim()) {
      updateFilters({ searchAddress: searchInput.trim() });
    }
  }, [searchInput, updateFilters]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t("orders.search_by_address")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-9 pr-3 py-2 bg-background border border-primary/20 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch}>
          {t("orders.search")}
        </Button>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              {t("orders.filters")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("orders.status")}</p>
                {(["ACTIVE", "COMPLETED", "CANCELLED"] as const).map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.status.includes(s)}
                      onCheckedChange={(checked) => {
                        const newStatus = checked ? [...filters.status, s] : filters.status.filter((st) => st !== s);
                        updateFilters({
                          status: newStatus as ("ACTIVE" | "COMPLETED" | "CANCELLED")[],
                        });
                      }}
                    />
                    <span className="text-sm">{t(`orders.${s.toLowerCase()}`)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t("orders.type")}</p>
                {(["regular", "prediction_market"] as const).map((ot) => (
                  <div key={ot} className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.orderTypes.includes(ot)}
                      onCheckedChange={(checked) => {
                        const newTypes = checked
                          ? [...filters.orderTypes, ot]
                          : filters.orderTypes.filter((t) => t !== ot);
                        updateFilters({ orderTypes: newTypes as OrderType[] });
                      }}
                    />
                    <span className="text-sm">{t(`orders.${ot}`)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">{t("orders.options")}</p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.hideExpired}
                    onCheckedChange={(checked) => updateFilters({ hideExpired: !!checked })}
                  />
                  <span className="text-sm">{t("orders.hide_expired")}</span>
                </div>
              </div>

              {address && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t("orders.ownership")}</p>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.onlyMine}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateFilters({ onlyMine: true, excludeMine: false });
                        } else {
                          updateFilters({ onlyMine: false });
                        }
                      }}
                    />
                    <span className="text-sm">{t("orders.only_my_orders")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.excludeMine}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          updateFilters({ excludeMine: true, onlyMine: false });
                        } else {
                          updateFilters({ excludeMine: false });
                        }
                      }}
                    />
                    <span className="text-sm">{t("orders.exclude_my_orders")}</span>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter pills */}
      {activePills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activePills.map((pill) => (
            <div
              key={`${pill.key}-${pill.value ?? "true"}`}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-sm"
            >
              <span>{pill.label}</span>
              <button
                type="button"
                onClick={() => removeFilter(pill.key as keyof FilterState, pill.value)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
// --- End OrderFilterPills component ---

export const OrdersPage = () => {
  const { t } = useTranslation();
  const { address } = useAccount();

  // State for filters
  const [filters, setFilters] = useState<FilterState>(defaultFilters); // Use OrderFilterPills state type

  const {
    data: orders,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<Order[], Error>({
    queryKey: ["allOrders"],
    queryFn: fetchAllOrders,
    // Keep data fresh, refetch in background
    staleTime: 60 * 1000, // 1 minute
    // Refetch on window focus
    refetchOnWindowFocus: true,
    // Don't refetch if component remounts and data is fresh
    refetchOnMount: false,
  });

  const handleRefresh = useCallback(() => {
    // Wrap in useCallback
    refetch();
  }, [refetch]); // Dependency on refetch

  const handleOrderFilled = useCallback(() => {
    // Wrap in useCallback
    // Refetch orders after a successful fill with a delay
    setTimeout(() => {
      refetch();
    }, 2000); // Adjust delay if necessary
  }, [refetch]); // Dependency on refetch

  // Filter orders based on the current filter state
  const filterOrders = useCallback(
    (orders: Order[] | undefined, currentFilters: FilterState) => {
      if (!orders) return [];

      return orders.filter((order) => {
        // Exclude launchpad orders completely (where maker is ZAMMLaunch contract)
        const isLaunchpadOrder = order?.maker?.toLowerCase() === ZAMMLaunchAddress.toLowerCase();
        if (isLaunchpadOrder) return false;

        // Exclude zICO orders (where maker is zICO contract)
        const isZICOOrder = order?.maker?.toLowerCase() === zICOAddress.toLowerCase();
        if (isZICOOrder) return false;

        // Determine order type
        const isPMRouterOrder = order?.maker?.toLowerCase() === PMRouterAddress.toLowerCase();
        const orderType: OrderType = isPMRouterOrder ? "prediction_market" : "regular";

        // Order type filter
        if (currentFilters.orderTypes.length > 0 && !currentFilters.orderTypes.includes(orderType)) {
          return false;
        }

        // Check if order is expired
        const deadline = new Date(Number(order.deadline) * 1000);
        const isExpired = deadline < new Date();

        // Hide expired filter
        if (currentFilters.hideExpired && isExpired) return false;

        // Status filter: Include if status list is empty or order status is in the list
        const statusMatch = currentFilters.status.length === 0 || currentFilters.status.includes(order.status);
        if (!statusMatch) return false;

        // Search by address filter
        if (currentFilters.searchAddress) {
          const searchLower = currentFilters.searchAddress.toLowerCase();
          const makerMatch = order.maker?.toLowerCase().includes(searchLower);
          if (!makerMatch) return false;
        }

        // Ownership filter
        const ownershipFilterActive = address && (currentFilters.onlyMine || currentFilters.excludeMine);
        if (ownershipFilterActive) {
          if (currentFilters.onlyMine && order.maker?.toLowerCase() !== address?.toLowerCase()) return false;
          if (currentFilters.excludeMine && order.maker?.toLowerCase() === address?.toLowerCase()) return false;
        }

        return true;
      });
    },
    [address],
  );

  // Use useMemo to calculate filteredOrders only when orders or filters change
  const filteredOrders = useMemo(
    () => filterOrders(orders, filters),
    [orders, filters, filterOrders], // Dependencies
  );

  // Initial loading state before any data arrives
  if (isLoading && !orders) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <LoadingLogo size="sm" />
          <span className="text-muted-foreground">{t("orders.loading_orders")}</span>
        </div>
      </div>
    );
  }

  // Show error message if fetch failed and no data exists
  if (error && !orders) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">{t("orders.error_fetching", { message: error.message })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("orders.title")}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-2"
        >
          <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("orders.refresh")}
        </Button>
      </div>

      <OrderFilterPills onFilter={setFilters} initialFilters={filters} />

      <OrderList
        orders={filteredOrders}
        currentUser={address}
        onOrderFilled={handleOrderFilled}
        isLoading={isLoading}
      />

      {isFetching && filteredOrders.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <LoadingLogo size="lg" />
        </div>
      )}
    </div>
  );
};

interface OrderListProps {
  orders: Order[];
  currentUser?: string;
  onOrderFilled: () => void;
  isLoading?: boolean;
}

const OrderList = ({ orders, currentUser, onOrderFilled, isLoading }: OrderListProps) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <LoadingLogo size="sm" />
          <span className="text-muted-foreground">{t("orders.loading_orders")}</span>
        </div>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-muted-foreground/30 rounded-lg">
        <p className="text-muted-foreground">{t("orders.no_filtered_orders")}</p>
        <p className="text-sm text-muted-foreground/70 mt-2">{t("orders.try_adjusting_filters")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} currentUser={currentUser} onOrderFilled={onOrderFilled} />
      ))}
    </div>
  );
};
