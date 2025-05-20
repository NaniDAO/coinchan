import { TradeView } from "@/TradeView";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/c/$coinId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { coinId } = Route.useParams();

  return <TradeView tokenId={BigInt(coinId)} />;
}
