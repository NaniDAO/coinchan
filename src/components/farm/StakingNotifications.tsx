import { useStakeableLpTokens } from "@/hooks/use-stakeable-lp-tokens";
import { useLpBalance } from "@/hooks/use-lp-balance";
import { formatImageURL } from "@/hooks/metadata";
import { formatBalance } from "@/lib/utils";
import { formatUnits } from "viem";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { FarmStakeDialog } from "../FarmStakeDialog";
import { APYDisplay } from "./APYDisplay";

interface StakingNotificationsProps {
  className?: string;
}

export function StakingNotifications({ className }: StakingNotificationsProps) {
  const { t } = useTranslation();
  const { stakeableTokens, summary, isLoading, hasUnstakedTokens, hasPartiallyStakedTokens } = useStakeableLpTokens();

  // Don't show if no stakeable tokens
  if (isLoading || (!hasUnstakedTokens && !hasPartiallyStakedTokens)) {
    return null;
  }

  const unstakedTokens = stakeableTokens.filter(t => !t.isStaked && t.balance > 0n);
  const partiallyStakedTokens = stakeableTokens.filter(t => t.isStaked && t.unstakeableAmount > 0n);

  return (
    <div className={className}>
      {/* Unstaked tokens notification */}
      {hasUnstakedTokens && (
        <div className="bg-gradient-to-r from-yellow-500/15 via-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="text-yellow-500 mt-0.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-mono font-bold text-yellow-500 text-sm">
                  [{t("common.unstaked_lp_tokens_found")}]
                </h4>
                <span className="font-mono text-xs text-yellow-500 border border-yellow-500/30 px-2 py-1 rounded">
                  {summary.unstakedTokens}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono mb-3">
                {t("common.unstaked_lp_tokens_description")}
              </p>
              <div className="space-y-2">
                {unstakedTokens.map((token) => (
                  <UnstakedTokenCard
                    key={token.stream.chefId.toString()}
                    token={token}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Partially staked tokens notification */}
      {hasPartiallyStakedTokens && (
        <div className="bg-gradient-to-r from-blue-500/15 via-blue-500/10 to-blue-500/5 border border-blue-500/30 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="text-blue-500 mt-0.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2Z" fill="currentColor"/>
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-mono font-bold text-blue-500 text-sm">
                  [{t("common.additional_lp_tokens_found")}]
                </h4>
                <span className="font-mono text-xs text-blue-500 border border-blue-500/30 px-2 py-1 rounded">
                  {summary.partiallyStakedTokens}
                </span>
              </div>
              <p className="text-sm text-muted-foreground font-mono mb-3">
                {t("common.additional_lp_tokens_description")}
              </p>
              <div className="space-y-2">
                {partiallyStakedTokens.map((token) => (
                  <PartiallyStakedTokenCard
                    key={token.stream.chefId.toString()}
                    token={token}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function UnstakedTokenCard({ token }: {
  token: any;
}) {
  const { t } = useTranslation();
  const { balance } = useLpBalance({
    lpToken: token.lpToken,
    poolId: token.stream.lpId,
  });

  return (
    <div className="bg-background/30 border border-yellow-500/20 rounded p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {token.lpToken?.imageUrl && (
          <img
            src={formatImageURL(token.lpToken.imageUrl)}
            alt={token.lpToken.symbol}
            className="w-6 h-6 rounded-full border border-yellow-500/30"
          />
        )}
        <div>
          <div className="font-mono font-bold text-sm text-foreground">
            {token.lpToken?.symbol || `Pool ${token.stream.lpId.toString().slice(0, 8)}...`}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {formatBalance(formatUnits(balance, 18), "LP")} • {" "}
            <APYDisplay stream={token.stream} lpToken={token.lpToken} shortView={true} />
          </div>
        </div>
      </div>
      <FarmStakeDialog
        stream={token.stream}
        lpToken={token.lpToken}
        trigger={
          <Button
            size="sm"
            className="font-mono font-bold tracking-wide text-xs bg-yellow-500 hover:bg-yellow-600 text-black"
          >
            [{t("common.stake")}]
          </Button>
        }
      />
    </div>
  );
}

function PartiallyStakedTokenCard({ token }: {
  token: any;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-background/30 border border-blue-500/20 rounded p-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {token.lpToken?.imageUrl && (
          <img
            src={formatImageURL(token.lpToken.imageUrl)}
            alt={token.lpToken.symbol}
            className="w-6 h-6 rounded-full border border-blue-500/30"
          />
        )}
        <div>
          <div className="font-mono font-bold text-sm text-foreground">
            {token.lpToken?.symbol || `Pool ${token.stream.lpId.toString().slice(0, 8)}...`}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {formatBalance(formatUnits(token.unstakeableAmount, 18), "LP")} more • {" "}
            <APYDisplay stream={token.stream} lpToken={token.lpToken} shortView={true} />
          </div>
        </div>
      </div>
      <FarmStakeDialog
        stream={token.stream}
        lpToken={token.lpToken}
        trigger={
          <Button
            size="sm"
            className="font-mono font-bold tracking-wide text-xs bg-blue-500 hover:bg-blue-600 text-white"
          >
            [{t("common.stake_more")}]
          </Button>
        }
      />
    </div>
  );
}