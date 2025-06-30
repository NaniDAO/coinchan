import { sdk } from "@farcaster/frame-sdk";
import "../index.css";
import { useEffect } from "react";

import PoolActions from "../PoolActions";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/swap")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    sdk.actions.ready(); // @TODO farcaster integration
  }, []);

  return (
    <TokenSelectionProvider>
      <PoolActions />
    </TokenSelectionProvider>
  );
}
