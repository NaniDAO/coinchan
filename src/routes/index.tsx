import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/explore" });
  },
  component: RouteComponent,
});

function RouteComponent() {
  return null;
}
