import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/positions")({
  component: FarmLayout,
});

function FarmLayout() {
  return (
    <div className="p-2 w-screen">
      <Outlet />
    </div>
  );
}
