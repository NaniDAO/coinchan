import { createFileRoute } from "@tanstack/react-router";
import PredictPage from "@/components/predict/PredictPage";
import { SEO } from "@/components/SEO";

export const Route = createFileRoute("/predict")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <SEO
        title="Prediction Markets"
        description="Trade on prediction markets with ZAMM. Bet on future outcomes and earn rewards. Decentralized, transparent, and on-chain."
        url="/predict"
      />
      <PredictPage />
    </>
  );
}
