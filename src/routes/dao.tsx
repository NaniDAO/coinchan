import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ZORG } from "@/components/dao/ZORG";

const daoSearchSchema = z.object({
  chat: z.enum(["fullscreen"]).optional(),
});

export const Route = createFileRoute("/dao")({
  component: RouteComponent,
  validateSearch: daoSearchSchema,
});

function RouteComponent() {
  const { chat } = Route.useSearch();
  return <ZORG isFullscreenChat={chat === "fullscreen"} />;
}
