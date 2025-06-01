import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Loader2, RefreshCcw } from "lucide-react";
import { OrderCard } from "./OrderCard";
import { INDEXER_URL } from "@/lib/indexer";
import { useQuery } from "@tanstack/react-query";

export interface Order {
  id: string; // orderHash
  maker: string;
  tokenIn: string;
  idIn: string;
  amtIn: string;
  tokenOut: string;
  idOut: string;
  amtOut: string;
  // Modified type based on prompt: deadline is a unix timestamp in ms (number)
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
        limit: 100
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

  console.log("Sending GraphQL query:", query);

  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  console.log("Response status:", response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    console.error("HTTP error response:", errorText);
    throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
  }

  const responseText = await response.text();
  console.log("Raw response:", responseText);

  const { data, errors } = JSON.parse(responseText);

  if (errors && errors.length > 0) {
    console.error("GraphQL errors:", errors);
    throw new Error(`GraphQL errors: ${JSON.stringify(errors)}`);
  }

  console.log("Parsed data:", data);
  const orders = data?.orders?.items || [];
  console.log(`Found ${orders.length} orders:`, orders);
  return orders;
};

export const OrdersPage = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [activeTab, setActiveTab] = useState("all");

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

  const handleRefresh = () => {
    refetch();
  };

  const handleOrderFilled = useCallback(() => {
    // Refetch orders after a successful fill with a delay
    setTimeout(() => {
      refetch();
    }, 2000); // Adjust delay if necessary
  }, [refetch]);

  const filterOrders = useCallback(
    (orders: Order[], filter: string) => {
      if (!orders) return []; // Handle case where orders data hasn't loaded yet

      switch (filter) {
        case "my":
          return orders.filter(
            (order) =>
              address && order.maker.toLowerCase() === address.toLowerCase(),
          );
        case "active":
          return orders.filter((order) => order.status === "ACTIVE");
        case "completed":
          return orders.filter((order) => order.status === "COMPLETED");
        case "available":
          return orders.filter(
            (order) =>
              order.status === "ACTIVE" &&
              (!address || order.maker.toLowerCase() !== address.toLowerCase()),
          );
        default:
          return orders;
      }
    },
    [address],
  );

  const filteredOrders = filterOrders(orders || [], activeTab);

  // Show initial loading state only if no data is available yet
  if (isLoading && !orders) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-muted-foreground">
            {t("orders.loading_orders")}
          </span>
        </div>
      </div>
    );
  }

  // Show error message if fetch failed and no data exists
  if (error && !orders) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">
          {t("orders.error_fetching", { message: error.message })}
        </p>
      </div>
    );
  }

  // Show empty state if data loaded but is empty AND not currently fetching
  if (!isLoading && !isFetching && (!orders || orders.length === 0)) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("orders.no_orders")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("orders.title")}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isFetching} // Use isFetching from react-query
          className="flex items-center gap-2"
        >
          <RefreshCcw
            className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
          {t("orders.refresh")}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">{t("orders.all_orders")}</TabsTrigger>
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="my" disabled={!address}>
            {t("orders.my_orders")}
          </TabsTrigger>
          <TabsTrigger value="active">{t("orders.active_orders")}</TabsTrigger>
          <TabsTrigger value="completed">
            {t("orders.completed_orders")}
          </TabsTrigger>
        </TabsList>

        {/* Render OrderList within each TabsContent */}
        {/* Ensure data is available before rendering */}
        {orders && (
          <>
            <TabsContent value="all" className="space-y-4">
              <OrderList
                orders={filteredOrders}
                currentUser={address}
                onOrderFilled={handleOrderFilled}
              />
            </TabsContent>

            <TabsContent value="available" className="space-y-4">
              <OrderList
                orders={filteredOrders}
                currentUser={address}
                onOrderFilled={handleOrderFilled}
              />
            </TabsContent>

            <TabsContent value="my" className="space-y-4">
              <OrderList
                orders={filteredOrders}
                currentUser={address}
                onOrderFilled={handleOrderFilled}
              />
            </TabsContent>

            <TabsContent value="active" className="space-y-4">
              <OrderList
                orders={filteredOrders}
                currentUser={address}
                onOrderFilled={handleOrderFilled}
              />
            </TabsContent>

            <TabsContent value="completed" className="space-y-4">
              <OrderList
                orders={filteredOrders}
                currentUser={address}
                onOrderFilled={handleOrderFilled}
              />
            </TabsContent>
          </>
        )}
        {/* Show loading indicator over list if fetching updates in background */}
        {isFetching && orders && orders.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </Tabs>
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
  // The empty state for the *overall* list is handled in OrdersPage.
  // If filteredOrders is empty, this component should still render
  // nothing or an empty list, but the "No Orders" message should probably
  // be outside of this component if it refers to the *total* list being empty.
  // However, if it refers to the *filtered* list being empty for a tab,
  // then it should be here. Let's assume it means the *filtered* list.
  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-6">
        {" "}
        {/* Slightly less padding for tab content */}
        <p className="text-muted-foreground">
          {t("orders.no_orders_filtered") || t("orders.no_orders")}
        </p>{" "}
        {/* Use a specific key or fallback */}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          currentUser={currentUser}
          onOrderFilled={onOrderFilled}
        />
      ))}
    </div>
  );
};
