import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { OrdersPage } from "@/components/OrdersPage";

export const Route = createFileRoute("/orders")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <div className="p-5">
      <h2 className="text-center mb-5 font-display uppercase tracking-[2px]">═══ {t("orders.title")} ═══</h2>

      <div className="orders-container">
        <OrdersPage />
      </div>
    </div>
  );
}
