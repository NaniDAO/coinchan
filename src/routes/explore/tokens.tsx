import CoinsTable from "@/components/explorer/coins-table";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/explore/tokens")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CoinsTable />;
}
