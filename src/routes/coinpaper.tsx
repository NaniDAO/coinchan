import { CoinPaper } from "@/CoinPaper";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/coinpaper")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  
  return (
    <div className="mt-2" title={t("coinpaper.title")}>
      <CoinPaper />
    </div>
  );
}
