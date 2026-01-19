import { createFileRoute } from "@tanstack/react-router";
import DAICOWizard from "@/components/dao/DAICOWizard";
import { SEO } from "@/components/SEO";

export const Route = createFileRoute("/daico")({
  component: DAICOPage,
});

function DAICOPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10">
      <SEO
        title="Launch a DAICO"
        description="Launch your token with DAICO protections on ZAMM. Built-in investor safeguards, community governance, and refund mechanisms. The safest way to fundraise on Ethereum."
        url="/daico"
      />
      <DAICOWizard />
    </div>
  );
}
