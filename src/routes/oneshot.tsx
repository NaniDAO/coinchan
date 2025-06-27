import { OneShotLaunchForm } from "@/components/OneShotLaunchForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/oneshot")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OneShotLaunchForm />;
}
