import PoolActions from "../PoolActions";
import { TokenSelectionProvider } from "../contexts/TokenSelectionContext";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/swap")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <TokenSelectionProvider>
      <PoolActions />
    </TokenSelectionProvider>
  );
}
