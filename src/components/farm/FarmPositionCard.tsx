import type { IncentiveStream, IncentiveUserPosition } from "@/hooks/use-incentive-streams";
import { useZChefPendingReward } from "@/hooks/use-zchef-contract";
import { ETH_TOKEN, type TokenMeta } from "@/lib/coins";
import { formatBalance } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatEther } from "viem";
import { FarmStakeDialog } from "../FarmStakeDialog";
import { FarmUnstakeDialog } from "../FarmUnstakeDialog";
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

  return (
    <div className="bg-gradient-to-br from-background/80 to-background/60 border-2 border-primary/40 rounded-lg p-1 backdrop-blur-sm shadow-lg hover:shadow-2xl hover:border-primary transition-all duration-300 relative overflow-hidden group">
      <IncentiveStreamCard stream={stream} lpToken={lpToken || ETH_TOKEN} />
      <div className="p-4 border-t border-primary/20 bg-background/50">
        {/* Pending Rewards Display */}
        {actualPendingRewards > 0n && (
          <div className="mb-3 p-3 bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-green-600 dark:text-green-400">
                {t("common.pending_rewards")}:
              </span>
              <span className="font-mono font-bold text-green-600 dark:text-green-400">
                {formatBalance(formatEther(actualPendingRewards), stream.rewardCoin?.symbol)}
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {lpToken && (
            <FarmStakeDialog
              stream={stream}
              lpToken={lpToken}
              trigger={
                <Button
                  size="default"
                  className="w-full font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
                >
                  [{t("common.stake")}]
                </Button>
              }
            />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Button
              size="default"
              variant="outline"
              onClick={() => onHarvest(position.chefId)}
              disabled={actualPendingRewards === 0n || isHarvesting}
              className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
            >
              {isHarvesting ? `[${t("common.harvesting")}...]` : `[${t("common.harvest")}]`}
            </Button>
            <FarmUnstakeDialog
              stream={stream}
              lpToken={lpToken || ETH_TOKEN}
              userPosition={position}
              trigger={
                <Button
                  size="default"
                  variant="outline"
                  className="font-mono font-bold tracking-wide hover:scale-105 transition-transform min-h-[44px]"
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
