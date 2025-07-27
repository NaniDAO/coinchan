import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useZCurveSale } from "@/hooks/use-zcurve-sale";

// Time formatting utility
const formatTimeRemaining = (deadline: Date): string => {
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();

  if (diff <= 0) return "expired";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h left`;

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${minutes}m left`;
};

interface ZCurveSaleBadgeProps {
  coinId: string;
  showDetails?: boolean;
}

export function ZCurveSaleBadge({ coinId, showDetails = false }: ZCurveSaleBadgeProps) {
  const { t } = useTranslation();
  const { data: sale, isLoading } = useZCurveSale(coinId);

  if (isLoading || !sale) return null;

  const deadline = new Date(Number(sale.deadline) * 1000);
  const isExpired = deadline < new Date();
  const isActive = sale.status === "ACTIVE" && !isExpired;
  const isFinalized = sale.status === "FINALIZED";

  if (!isActive && !showDetails) return null;

  const fundedPercent = sale.percentFunded / 100;

  if (isFinalized && showDetails) {
    return (
      <Badge variant="secondary" className="gap-1">
        <span className="text-xs">✅</span>
        {t("sale.finalized", "Finalized")}
      </Badge>
    );
  }

  if (isExpired && !isFinalized && showDetails) {
    return (
      <Badge variant="outline" className="gap-1">
        <span className="text-xs">⏰</span>
        {t("sale.expired", "Expired")}
      </Badge>
    );
  }

  if (isActive) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="default" className="gap-1 bg-primary">
          <span className="text-xs">🚀</span>
          {t("sale.zcurve_live", "zCurve Live")}
        </Badge>
        {showDetails && (
          <>
            <Badge variant="outline" className="text-xs">
              {fundedPercent.toFixed(0)}% {t("sale.funded", "funded")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t("sale.ends_in", "Ends")} {formatTimeRemaining(deadline)}
            </span>
          </>
        )}
      </div>
    );
  }

  return null;
}
