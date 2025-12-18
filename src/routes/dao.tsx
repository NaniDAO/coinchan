import { createFileRoute } from "@tanstack/react-router";
import { ZORG } from "@/components/dao/ZORG";

export const Route = createFileRoute("/dao")({
  component: RouteComponent,
});

function RouteComponent() {
  return <ZORG />;
}
