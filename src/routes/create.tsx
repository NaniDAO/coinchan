import { CoinForm } from "@/CoinForm";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  
  return (
    <div className="flex items-center justify-center mt-5" title={t("create.title")}>
      <CoinForm />
    </div>
  );
}
