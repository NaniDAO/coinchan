import { CoinPaper } from "@/CoinPaper";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/coinpaper")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="mt-2">
      <CoinPaper />
    </div>
  );
}
