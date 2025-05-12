import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/coinpaper")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/coinpaper"!</div>;
}
