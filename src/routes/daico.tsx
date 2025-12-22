import { createFileRoute } from "@tanstack/react-router";
import DAICOWizard from "@/components/dao/DAICOWizard";

export const Route = createFileRoute("/daico")({
  component: DAICOPage,
});

function DAICOPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/10">
      <DAICOWizard />
    </div>
  );
}
