import { TradeView } from "@/TradeView";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/c/$coinId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { coinId } = Route.useParams();

  // Apply translation to coin view
  return (
    <div aria-label={t("coin.price")}>
      <TradeView tokenId={BigInt(coinId)} />
    </div>
  );
}
