import { FarmForm } from "@/components/FarmForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/farm")({
  component: RouteComponent,
});

function RouteComponent() {
  return <FarmForm />;
}
