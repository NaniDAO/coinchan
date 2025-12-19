import { createFileRoute } from "@tanstack/react-router";
import { MarketDetailPage } from "@/components/predict/MarketDetailPage";

// Legacy route that includes marketType for backwards compatibility
// Now all markets are PAMM, so marketType is ignored
export const Route = createFileRoute("/predict/$marketType/$marketId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { marketId } = Route.useParams();
  return <MarketDetailPage marketId={marketId} />;
}
