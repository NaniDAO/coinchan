import { SendTile } from "@/SendTile";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/send")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="py-5 w-full max-w-full">
      <div className="flex justify-center py-5">
        <div className="w-full max-w-5xl mx-auto ">
          <SendTile />
        </div>
      </div>
    </div>
  );
}
