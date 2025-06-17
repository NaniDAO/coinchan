import Coins from "@/Coins";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/explore")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleLaunch = () => {
    navigate({ to: "/launch" });
  };

  const handleSend = () => {
    navigate({ to: "/send" });
  };

  const handleOrders = () => {
    navigate({ to: "/orders" });
  };

  return (
    <div className="!p-5 !mb-[50px]">
      <h2 className="text-center mb-5 font-display uppercase tracking-[2px]">
        {t("explore.coin_explorer")}
      </h2>

      <div className="mb-6 flex gap-3 justify-center font-display text-sm tracking-widest">
        {[
          { label: t("common.launch"), icon: "+", onClick: handleLaunch },
          { label: t("common.send"), icon: "→", onClick: handleSend },
          { label: t("common.orders"), icon: "📋", onClick: handleOrders },
        ].map(({ label, icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group uppercase px-4 py-3 w-full max-w-[150px] border-2 border-border bg-background text-foreground flex items-center justify-center gap-2 transition-all duration-150 ease-in-out hover:bg-primary hover:text-primary-foreground hover:shadow-[3px_3px_0_var(--border)] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-0 active:translate-y-0 active:shadow-none"
          >
            <span className="text-lg group-hover:animate-terminal-ping">
              {icon}
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <Coins />
    </div>
  );
}
