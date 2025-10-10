import CreateICOWizard from "@/components/ico";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ico")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateICOWizard />;
}
