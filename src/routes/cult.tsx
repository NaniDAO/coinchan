import "../index.css";

import { CultBuySell } from "../CultBuySell";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cult")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <TokenSelectionProvider>
      <CultBuySell />
    </TokenSelectionProvider>
  );
}
