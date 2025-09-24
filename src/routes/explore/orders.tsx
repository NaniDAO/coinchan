import { OrdersPage } from "@/components/OrdersPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/explore/orders")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="p-5">
      <div className="orders-container">
        <OrdersPage />
      </div>
    </div>
  );
}
