import { sdk } from "@farcaster/frame-sdk";
import "../index.css";
import { useEffect } from "react";

import PoolActions from "../PoolActions";

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  useEffect(() => {
    sdk.actions.ready(); // @TODO farcaster integration
  }, []);

  return (
    <div style={{ padding: '20px 0' }}>
      <PoolActions />
    </div>
  );
}
