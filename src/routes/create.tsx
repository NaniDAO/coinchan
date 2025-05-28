import { CoinForm } from "@/CoinForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CoinForm />;
}
