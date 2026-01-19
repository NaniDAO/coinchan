import { LandingPage } from "@/components/LandingPage";
import { SEO } from "@/components/SEO";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const handleEnterApp = () => {
    navigate({ to: "/swap" });
  };

  return (
    <>
      <SEO
        title="Cheapest Ethereum DEX & DAICO Launchpad"
        description="ZAMM is the most gas-efficient DEX on Ethereum. Trade tokens, place limit orders, and launch your own token with DAICO protections. No custody, minimal fees."
        url="/"
      />
      <LandingPage onEnterApp={handleEnterApp} />
    </>
  );
}
