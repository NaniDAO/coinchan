import { createFileRoute } from "@tanstack/react-router";
import { MegaPage } from "@/components/predict/MegaPage";

export const Route = createFileRoute("/mega")({
  component: RouteComponent,
});

function RouteComponent() {
  return <MegaPage />;
}
