import { LandingPage } from "@/components/LandingPage";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const handleEnterApp = () => {
    navigate({ to: "/swap" });
  };

  return <LandingPage onEnterApp={handleEnterApp} />;
}
