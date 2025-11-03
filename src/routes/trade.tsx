import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/trade")({
  beforeLoad: () => {
    throw redirect({ to: "/swap" });
  },
});
