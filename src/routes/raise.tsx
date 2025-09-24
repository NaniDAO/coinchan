import RaiseForm from "@/components/raise/form/RaiseForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/raise")({
  component: RouteComponent,
});

function RouteComponent() {
  return <RaiseForm />;
}
