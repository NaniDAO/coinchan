import { sdk } from "@farcaster/frame-sdk";
import "../index.css";
import { useEffect } from "react";

import { CultBuySell } from "../CultBuySell";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/cult")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    sdk.actions.ready(); // @TODO farcaster integration
  }, []);

  return (
    <TokenSelectionProvider>
      <CultBuySell />
    </TokenSelectionProvider>
  );
}