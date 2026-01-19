import CreateCoinWizard from "@/components/create";
import { SEO } from "@/components/SEO";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <SEO
        title="Create Token"
        description="Create your own ERC-20 token on Ethereum with ZAMM. Simple wizard, low gas fees, and instant deployment. No coding required."
        url="/create"
      />
      <CreateCoinWizard />
    </>
  );
}
