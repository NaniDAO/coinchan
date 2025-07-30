import { ZCurveSales } from "@/components/ZCurveSales";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/coins")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="px-2 py-2 lg:px-8 lg:py-4">
      <ZCurveSales />
    </div>
  );
}
