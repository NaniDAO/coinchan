import { createFileRoute } from "@tanstack/react-router";
import PredictPage from "@/components/predict/PredictPage";

export const Route = createFileRoute("/predict")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PredictPage />;
}
