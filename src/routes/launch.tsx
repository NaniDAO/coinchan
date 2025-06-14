import { LaunchForm } from "@/components/LaunchForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/launch")({
  component: RouteComponent,
});

function RouteComponent() {
  return <LaunchForm />;
}
