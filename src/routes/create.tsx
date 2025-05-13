import { CoinForm } from "@/CoinForm";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex items-center justify-center mt-5">
      <CoinForm />
    </div>
  );
}
