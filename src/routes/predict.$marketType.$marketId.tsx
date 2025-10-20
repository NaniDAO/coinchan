import { createFileRoute } from "@tanstack/react-router";
import { MarketDetailPage } from "@/components/predict/MarketDetailPage";

export const Route = createFileRoute("/predict/$marketType/$marketId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { marketType, marketId } = Route.useParams();
  return <MarketDetailPage marketType={marketType as "parimutuel" | "amm"} marketId={marketId} />;
}
