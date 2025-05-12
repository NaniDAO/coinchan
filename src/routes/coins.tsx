import Coins from "@/Coins";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/coins")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="m-1">
      <Coins />
    </div>
  );
}
