import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { OrdersPage } from "@/components/OrdersPage";

export const Route = createFileRoute("/orders")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <main className="p-2 sm:p-3 min-h-[90vh] w-screen flex flex-col" aria-label={t("orders.title")}>
      <div className="w-full max-w-6xl mx-auto">
        <OrdersPage />
      </div>
    </main>
  );
}
