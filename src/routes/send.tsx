import { SendTile } from "@/SendTile";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/send")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="p-2 sm:p-3 min-h-[90vh] w-screen flex flex-col justify-center items-center">
      <div className="w-full max-w-lg">
        <SendTile />
      </div>
    </main>
  );
}
