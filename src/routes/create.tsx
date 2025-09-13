import { CreateCoinWizard } from "@/components/create";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return <CreateCoinWizard />;
}
