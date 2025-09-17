import "../index.css";

import { WlfiBuySell } from "../WlfiBuySell";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/wlfi")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <TokenSelectionProvider>
      <WlfiBuySell />
    </TokenSelectionProvider>
  );
}
