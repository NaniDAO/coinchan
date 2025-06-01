import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Loader2, RefreshCcw } from "lucide-react";
import { OrderCard } from "./OrderCard";
import { OrdersDebug } from "./OrdersDebug";
import { INDEXER_URL } from "@/lib/indexer";

export interface Order {
  id: string; // orderHash
  maker: string;
  tokenIn: string;
  idIn: string;
  amtIn: string;
  tokenOut: string;
  idOut: string;
  amtOut: string;
  deadline: string;
  partialFill: boolean;
  inDone: string;
  outDone: string;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
  txHash: string;
  blockNumber: string;
}

export const OrdersPage = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("all");

  const fetchOrders = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      // Log environment info for debugging
      console.log("Indexer URL:", INDEXER_URL);
      console.log("Environment VITE_INDEXER_URL:", import.meta.env.VITE_INDEXER_URL);
      
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
      setOrders(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      setOrders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleRefresh = () => {
    fetchOrders(true);
  };

  const handleOrderFilled = useCallback(() => {
    // Refresh orders after a successful fill
    setTimeout(() => fetchOrders(true), 2000);
  }, [fetchOrders]);

  const filterOrders = (orders: Order[], filter: string) => {
    switch (filter) {
      case "my":
        return orders.filter((order) => address && order.maker.toLowerCase() === address.toLowerCase());
      case "active":
        return orders.filter((order) => order.status === "ACTIVE");
      case "completed":
        return orders.filter((order) => order.status === "COMPLETED");
      case "available":
        return orders.filter(
          (order) => order.status === "ACTIVE" && (!address || order.maker.toLowerCase() !== address.toLowerCase()),
        );
      default:
        return orders;
    }
  };

  const filteredOrders = filterOrders(orders, activeTab);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-muted-foreground">{t("orders.loading_orders")}</span>
        </div>
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
          disabled={refreshing}
          className="flex items-center gap-2"
        >
          <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {t("orders.refresh")}
        </Button>
      </div>

      {/* Debug Information - Remove in production */}
      <OrdersDebug />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">{t("orders.all_orders")}</TabsTrigger>
          <TabsTrigger value="available">Available</TabsTrigger>
          <TabsTrigger value="my" disabled={!address}>
            {t("orders.my_orders")}
          </TabsTrigger>
          <TabsTrigger value="active">{t("orders.active_orders")}</TabsTrigger>
          <TabsTrigger value="completed">{t("orders.completed_orders")}</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          <OrderList orders={filteredOrders} currentUser={address} onOrderFilled={handleOrderFilled} />
        </TabsContent>

        <TabsContent value="available" className="space-y-4">
          <OrderList orders={filteredOrders} currentUser={address} onOrderFilled={handleOrderFilled} />
        </TabsContent>

        <TabsContent value="my" className="space-y-4">
          <OrderList orders={filteredOrders} currentUser={address} onOrderFilled={handleOrderFilled} />
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <OrderList orders={filteredOrders} currentUser={address} onOrderFilled={handleOrderFilled} />
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <OrderList orders={filteredOrders} currentUser={address} onOrderFilled={handleOrderFilled} />
        </TabsContent>
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

  if (orders.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t("orders.no_orders")}</p>
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
