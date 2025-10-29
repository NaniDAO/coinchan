import "../index.css";

import { JpycBuySell } from "../JpycBuySell";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/jpyc")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <TokenSelectionProvider>
      <JpycBuySell />
    </TokenSelectionProvider>
  );
}
