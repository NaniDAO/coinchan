import { useTranslation } from "react-i18next";
import { useDAOStats } from "@/hooks/use-dao-stats";
import { formatUnits } from "viem";

export const DAOStats = () => {
  const { t } = useTranslation();
  const { proposalCount, totalSupply, quorumBps, proposalThreshold, isLoading } = useDAOStats();

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h3 className="text-lg font-semibold mb-4">{t("dao.stats")}</h3>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-muted animate-pulse rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("dao.total_proposals")}
            </div>
            <div className="text-2xl font-bold font-mono">{proposalCount}</div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("dao.total_shares")}
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatUnits(totalSupply, 18)}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("dao.quorum_requirement")}
            </div>
            <div className="text-2xl font-bold font-mono">
              {(quorumBps / 100).toFixed(1)}%
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("dao.proposal_threshold")}
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatUnits(proposalThreshold, 18)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
