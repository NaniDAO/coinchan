import "../index.css";

import { EnsBuySell } from "../EnsBuySell";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/ens")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <TokenSelectionProvider>
      <EnsBuySell />
    </TokenSelectionProvider>
  );
}
