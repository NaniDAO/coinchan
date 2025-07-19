import { Checkbox } from "@/components/ui/checkbox"; // Import from prompt path
// New imports for pills
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"; // Import from prompt path
import { ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { INDEXER_URL } from "@/lib/indexer";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw, X } from "lucide-react"; // Keep existing and add X explicitely
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

interface FilterState {
  status: ("ACTIVE" | "COMPLETED" | "CANCELLED")[]; // Use specific status types
  onlyMine: boolean;
  excludeMine: boolean;
}

const defaultFilters: FilterState = {
  status: [],
  onlyMine: false,
  excludeMine: false,
};

// --- OrderFilterPills component (from prompt) ---
export const OrderFilterPills = ({
  onFilter,
}: {
  onFilter: (f: FilterState) => void;
}) => {
  const { t } = useTranslation();
  const { address } = useAccount(); // Keep useAccount if needed for disabled state or similar

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [popoverOpen, setPopoverOpen] = useState(false);

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
    (key: keyof FilterState, value?: any) => {
      setFilters((prevFilters) => {
        const updated = { ...prevFilters };
        if (key === "status" && value) {
          updated.status = updated.status.filter((s) => s !== value);
        } else {
          // Reset boolean filters
          (updated[key] as boolean) = defaultFilters[key] as boolean;
        }
        onFilter(updated); // Call the parent's callback
        return updated;
      });
    },
    [onFilter],
  ); // Dependency on onFilter

  const activePills = useMemo(() => {
    const pills = [];
    filters.status.forEach((s) => {
      pills.push({
        label: `${t("orders.status")}: ${s}`,
        key: "status",
        value: s,
      }); // Use translation for "Status"
    });
    // Only show ownership pills if address is connected
    if (address) {
      if (filters.onlyMine) pills.push({ label: t("orders.only_my_orders"), key: "onlyMine" }); // Use translation
      if (filters.excludeMine)
        pills.push({
          label: t("orders.exclude_my_orders"),
          key: "excludeMine",
        }); // Use translation
    }
    return pills;
  }, [filters, t, address]); // Dependencies: filters, t for translations, address for conditional pills

  return (
    <div className="space-y-4">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            {t("orders.add_filter")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("orders.status")}</p> {/* Use translation */}
              {(["ACTIVE", "COMPLETED", "CANCELLED"] as const).map(
                (
                  s, // Use 'as const' for type safety
                ) => (
                  <div key={s} className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.status.includes(s)}
                      onCheckedChange={(checked) => {
                        const newStatus = checked ? [...filters.status, s] : filters.status.filter((st) => st !== s);
                        updateFilters({
                          status: newStatus as ("ACTIVE" | "COMPLETED" | "CANCELLED")[],
                        }); // Cast for type safety
                      }}
                    />
                    <span className="text-sm">
                      {s === "ACTIVE" && t("orders.active")}
                      {s === "COMPLETED" && t("orders.completed")}
                      {s === "CANCELLED" && t("orders.cancelled")}
                    </span>
                  </div>
                ),
              )}
            </div>
            {/* Only show ownership filters if address is connected */}
            {address && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("orders.ownership")}</p> {/* Use translation */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.onlyMine}
                    onCheckedChange={(checked) => {
                      // If checking 'Only Mine', uncheck 'Exclude Mine'
                      if (checked) {
                        updateFilters({ onlyMine: true, excludeMine: false });
                      } else {
                        updateFilters({ onlyMine: false });
                      }
                    }}
                  />
                  <span className="text-sm">{t("orders.only_my_orders")}</span> {/* Use translation */}
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.excludeMine}
                    onCheckedChange={(checked) => {
                      // If checking 'Exclude Mine', uncheck 'Only Mine'
                      if (checked) {
                        updateFilters({ excludeMine: true, onlyMine: false });
                      } else {
                        updateFilters({ excludeMine: false });
                      }
                    }}
                  />
                  <span className="text-sm">{t("orders.exclude_my_orders")}</span> {/* Use translation */}
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {activePills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {activePills.map((pill) => (
            <div
              key={`${pill.key}-${pill.label ?? "true"}`}
              className="flex items-center gap-1 px-3 py-1 rounded-full bg-muted text-sm"
            >
              <span>{pill.label}</span>
              <button
                onClick={() => removeFilter(pill.key as keyof FilterState, pill.label)}
                className="text-muted-foreground hover:text-foreground" // Add hover state for clarity
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
      if (!orders) return []; // Handle case where orders data hasn't loaded yet

      return orders.filter((order) => {
        // Exclude launchpad orders completely (where maker is ZAMMLaunch contract)
        const isLaunchpadOrder = order.maker.toLowerCase() === ZAMMLaunchAddress.toLowerCase();
        if (isLaunchpadOrder) return false;

        // Status filter: Include if status list is empty or order status is in the list
        const statusMatch = currentFilters.status.length === 0 || currentFilters.status.includes(order.status);

        // Ownership filter:
        // Applies only if address is connected AND (onlyMine or excludeMine is true)
        const ownershipFilterActive = address && (currentFilters.onlyMine || currentFilters.excludeMine);

        const ownershipMatch =
          !ownershipFilterActive || // If filter is not active, it matches
          (currentFilters.onlyMine && order.maker.toLowerCase() === address?.toLowerCase()) || // If onlyMine, check maker
          (currentFilters.excludeMine && order.maker.toLowerCase() !== address?.toLowerCase()); // If excludeMine, check maker

        // An order matches if both status and ownership filters match
        return statusMatch && ownershipMatch;
      });
    },
    [address], // Dependency on address for ownership filter
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

  // Empty state for the total list when fetch is done and no data exists at all
  // Note: This is different from the empty state for the *filtered* list
  if (!isLoading && !isFetching && (!orders || orders.length === 0)) {
    // If filters are applied but result is empty, the OrderList handles it.
    // This state is only for the case where the TOTAL data fetch returned empty.
    // If filters === defaultFilters and orders.length === 0, this is the right message.
    // If filters !== defaultFilters and filteredOrders.length === 0, OrderList shows its message.
    // Let's check if filters are default to avoid showing this if filters caused the emptiness.
    const isDefaultFilter = filters.status.length === 0 && !filters.onlyMine && !filters.excludeMine;
    if (isDefaultFilter) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t("orders.no_orders")}</p> {/* This should mean 'No orders at all' */}
        </div>
      );
    }
  }

  return (
    <div className="space-y-6 relative">
      {" "}
      {/* Added relative positioning */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("orders.title")}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching} // Use isFetching from react-query
          className="flex items-center gap-2"
        >
          <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          {t("orders.refresh")}
        </Button>
      </div>
      {/* Render the filter pills component */}
      {/* OrderFilterPills component should be rendered even if orders is null/empty, as it allows setting filters */}
      {/* It calls setFilters which updates the parent state */}
      <OrderFilterPills onFilter={setFilters} />
      {/* Render the OrderList or specific empty state messages based on data/filter status */}
      {/* If orders exist (even empty after filtering), render the list container */}
      {/* The OrderList component will show 'No orders' if filteredOrders is empty */}
      {/* Only render OrderList if the raw data fetch was successful and returned some data initially OR if we are currently fetching but had previous data*/}
      {
        (orders && orders.length > 0) || (isFetching && filteredOrders.length > 0) ? ( // Render if we have initial data OR if we are fetching but already have filtered data
          <OrderList
            orders={filteredOrders} // Pass the filtered data
            currentUser={address}
            onOrderFilled={handleOrderFilled}
          />
        ) : !isLoading && !isFetching && filteredOrders.length === 0 && (orders?.length ?? 0) > 0 ? (
          // This state occurs when data was fetched, but applying filters results in an empty list.
          // The OrderList component's internal empty state message handles this case.
          // We don't need a separate div here, the OrderList component renders the message.
          // So, simply render OrderList when data exists.
          // The condition above (orders && orders.length > 0) covers the case where the total list is not empty.
          // If the total list is empty, the check "!isLoading && !isFetching && (!orders || orders.length === 0)" handles it.
          // If the total list has items, but filtered is empty, the OrderList component itself will render the empty message.
          // So, the conditional rendering for the list can be simplified.
          <OrderList
            orders={filteredOrders} // Pass the filtered data
            currentUser={address}
            onOrderFilled={handleOrderFilled}
          />
        ) : null /* Don't render OrderList if no data at all */
      }
      {/* Show loading indicator over list if fetching updates in background */}
      {/* Position absolutely within the relative parent */}
      {/* Show overlay if fetching AND there are orders currently being displayed */}
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
}

const OrderList = ({ orders, currentUser, onOrderFilled }: OrderListProps) => {
  const { t } = useTranslation();

  // This component only receives filtered orders.
  // If the filtered list is empty, show a message specific to the filtered result.
  // The message "No Orders" is slightly ambiguous, but let's assume it's okay for both total empty and filtered empty.
  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-muted-foreground">{t("orders.no_filtered_orders") || t("orders.no_orders")}</p>{" "}
        {/* Consider adding a specific key for filtered empty state */}
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
