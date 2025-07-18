import type { IncentiveStream, IncentiveUserPosition } from "@/hooks/use-incentive-streams";
import { useZChefPendingReward, useZChefUserBalance } from "@/hooks/use-zchef-contract";
import { ETH_TOKEN, type TokenMeta } from "@/lib/coins";
import { formatBalance } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { FarmUnstakeDialog } from "../FarmUnstakeDialog";
import { FarmMigrateDialog } from "../FarmMigrateDialog";
import { IncentiveStreamCard } from "../IncentiveStreamCard";
import { Button } from "../ui/button";

interface FarmPositionCardProps {
  position: IncentiveUserPosition;
  stream: IncentiveStream;
  lpToken: TokenMeta | undefined;
  onHarvest: (chefId: bigint) => Promise<void>;
  isHarvesting: boolean;
}

export function FarmPositionCard({ position, stream, lpToken, onHarvest, isHarvesting }: FarmPositionCardProps) {
  const { t } = useTranslation();

  // Get real-time pending rewards from contract
  const { data: onchainPendingRewards } = useZChefPendingReward(stream.chefId);
  const actualPendingRewards = onchainPendingRewards ?? position.pendingRewards;

  // Get real-time user balance from contract
  const { data: onchainUserBalance } = useZChefUserBalance(stream.chefId);
  const actualUserShares = onchainUserBalance ?? position.shares;

  // Don't show card if user has no shares
  if (!actualUserShares || actualUserShares === 0n) {
    return null;
  }
  return (
    <div className="bg-card text-card-foreground border-2 border-border transition-all h group relative overflow-hidden">
      <IncentiveStreamCard stream={stream} lpToken={lpToken || ETH_TOKEN} />
      <div className="p-4 sm:p-6">
        {/* Staked Amount Display */}
        <div className="mb-3 p-3 border border-muted bg-background">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              [{t("common.staked")}]:
            </span>
            <span className="font-mono font-bold text-foreground text-left sm:text-right">
              {formatBalance(formatEther(actualUserShares), `${lpToken?.symbol} LP`)}
            </span>
          </div>
        </div>

        {/* Pending Rewards Display */}
        {actualPendingRewards > 0n && (
          <div className="mb-3 p-3 border border-green-700 bg-background">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0">
              <span className="text-xs font-mono text-green-700 uppercase tracking-wider">
                [{t("common.pending_rewards")}]:
              </span>
              <span className="font-mono font-bold text-green-600 text-left sm:text-right">
                {formatBalance(formatEther(actualPendingRewards), stream.rewardCoin?.symbol)}
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              size="default"
              variant="outline"
              onClick={() => onHarvest(position.chefId)}
              disabled={actualPendingRewards === 0n || isHarvesting}
              className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px] py-3"
            >
              {isHarvesting ? `[${t("common.harvesting")}...]` : `[${t("common.harvest")}]`}
            </Button>
            <FarmMigrateDialog
              stream={stream}
              lpToken={lpToken || ETH_TOKEN}
              userPosition={{
                ...position,
                shares: actualUserShares, // Use onchain balance
                pendingRewards: actualPendingRewards, // Use onchain rewards
              }}
              trigger={
                <Button
                  size="default"
                  variant="outline"
                  className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px] py-3"
                >
                  [{t("common.migrate")}]
                </Button>
              }
            />
            <FarmUnstakeDialog
              stream={stream}
              lpToken={lpToken || ETH_TOKEN}
              userPosition={{
                ...position,
                shares: actualUserShares, // Use onchain balance
                pendingRewards: actualPendingRewards, // Use onchain rewards
              }}
              trigger={
                <Button
                  size="default"
                  variant="outline"
                  className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px] py-3"
                >
                  [{t("common.unstake")}]
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
