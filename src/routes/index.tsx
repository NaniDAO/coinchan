import { sdk } from "@farcaster/frame-sdk";
import "../index.css";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

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
    <main className="p-2 sm:p-3 min-h-[90vh] w-screen flex flex-col justify-center items-center">
      <div className="w-full max-w-lg">
        <PoolActions />
      </div>
    </main>
  );
}
