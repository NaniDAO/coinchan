import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LandingPage } from "../components/LandingPage";

export const Route = createFileRoute("/landing")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const handleEnterApp = () => {
    navigate({ to: "/" });
  };

  return <LandingPage onEnterApp={handleEnterApp} />;
}