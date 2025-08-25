import { CreateFarm } from "@/components/farm/CreateFarm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/farm/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen !p-3 sm:!p-6 !mb-[50px]">
      <CreateFarm />
    </div>
  );
}
