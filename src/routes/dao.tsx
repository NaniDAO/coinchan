import { createFileRoute } from "@tanstack/react-router";
import { CyberspaceDAO } from "@/components/dao/CyberspaceDAO";

export const Route = createFileRoute("/dao")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CyberspaceDAO />;
}
