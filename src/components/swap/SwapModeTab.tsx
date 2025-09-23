import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const SwapModeTab = () => {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="flex items-center justify-start mb-4">
      <div className="inline-flex gap-1 border-2 border-border bg-muted p-0.5">
        <Link
          to="/swap"
          className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
            location.pathname === "/swap"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {t("swap.instant")}
        </Link>
        <Link
          to="/limit"
          className={`px-3 py-1.5 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 focus:ring-2 focus:ring-primary/50 focus:outline-none ${
            location.pathname === "/limit"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {t("swap.limit_order")}
        </Link>
      </div>
    </div>
  );
};
