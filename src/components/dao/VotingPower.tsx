import { useTranslation } from "react-i18next";
import { useAccount } from "wagmi";
import { useDAOUserPower } from "@/hooks/use-dao-voting-power";
import { formatUnits } from "viem";

export const VotingPower = () => {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { balance, votingPower, delegate, isDelegating, isLoading } = useDAOUserPower({ address });

  if (!address) {
    return (
      <div className="border border-border rounded-lg p-6 bg-card">
        <h3 className="text-lg font-semibold mb-4">{t("dao.voting_power")}</h3>
        <p className="text-sm text-muted-foreground text-center">
          {t("dao.connect_to_view_power")}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-lg p-6 bg-card">
      <h3 className="text-lg font-semibold mb-4">{t("dao.voting_power")}</h3>

      {isLoading ? (
        <div className="space-y-3">
          <div className="h-8 bg-muted animate-pulse rounded" />
          <div className="h-8 bg-muted animate-pulse rounded" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("dao.shares")}</span>
            <span className="font-mono font-semibold text-lg">
              {formatUnits(balance, 18)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("dao.voting_power_label")}</span>
            <span className="font-mono font-semibold text-lg">
              {formatUnits(votingPower, 18)}
            </span>
          </div>

          {isDelegating && delegate && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1">{t("dao.delegated_to")}</p>
              <p className="font-mono text-xs break-all">{delegate}</p>
            </div>
          )}

          {balance > 0n && !isDelegating && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-green-400">{t("dao.self_delegated")}</p>
            </div>
          )}

          {balance === 0n && (
            <div className="pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">{t("dao.no_shares")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
