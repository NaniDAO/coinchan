import Coins from "@/Coins";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/explore")({
  component: RouteComponent,
});

function RouteComponent() {
  // Use translation hook in the component - prevents unused import error
  const { t } = useTranslation();

  return (
    <div className="m-1" title={t("explore.title")}>
      <Coins />
    </div>
  );
}
