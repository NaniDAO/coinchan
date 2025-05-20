import { SendTile } from "@/SendTile";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/send")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  
  return (
    <main className="p-2 sm:p-3 min-h-[90vh] w-screen flex flex-col justify-center items-center"
          aria-label={t("send.title")}>
      <div className="w-full max-w-lg">
        <SendTile />
      </div>
    </main>
  );
}
