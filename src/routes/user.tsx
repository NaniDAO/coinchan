import { UserPage } from "@/components/UserPage";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/user")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="py-5 w-full max-w-full">
      <div className="flex justify-center py-5">
        <div className="w-full max-w-5xl mx-auto">
          <UserPage />
        </div>
      </div>
    </div>
  );
}
