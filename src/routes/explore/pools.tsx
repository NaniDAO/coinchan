import PoolsTable from "@/components/explorer/pools-table";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/explore/pools")({
  component: RouteComponent,
});

function RouteComponent() {
  return <PoolsTable />;
}
