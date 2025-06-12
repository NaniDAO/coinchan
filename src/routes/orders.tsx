import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { OrdersPage } from "@/components/OrdersPage";

export const Route = createFileRoute("/orders")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <div style={{ padding: '20px 0' }}>
      <h2 style={{ 
        textAlign: 'center', 
        marginBottom: '20px',
        fontFamily: 'var(--font-display)',
        textTransform: 'uppercase',
        letterSpacing: '2px'
      }}>
        ═══ {t("orders.title")} ═══
      </h2>
      
      <div className="orders-container">
        <OrdersPage />
      </div>
    </div>
  );
}
