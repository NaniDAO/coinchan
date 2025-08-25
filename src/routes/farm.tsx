import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/farm")({
  component: FarmLayout,
});

function FarmLayout() {
  return (
    <div className="min-h-screen !p-3 sm:!p-6 !mb-[50px]">
      <Outlet />
    </div>
  );
}
