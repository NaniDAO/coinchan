import { createFileRoute } from "@tanstack/react-router";
import { DAICOSalesTable } from "@/components/dao/daico-sales-table";

export const Route = createFileRoute("/explore/daicos")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">DAICO Sales</h1>
        <p className="text-muted-foreground">Explore active DAO token sales with built-in governance features</p>
      </div>
      <DAICOSalesTable />
    </div>
  );
}
