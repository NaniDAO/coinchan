import { IncentiveStreamCard } from "@/components/IncentiveStreamCard";
import { FarmHarvestDialog } from "@/components/FarmHarvestDialog";
import { FarmUnstakeDialog } from "@/components/FarmUnstakeDialog";
import { RedemptionCard } from "@/components/RedemptionCard";
import { Button } from "@/components/ui/button";
import { useIncentiveStream } from "@/hooks/use-incentive-stream";
import { useRedemptionOrder } from "@/hooks/use-redemption-order";
import { useZChefPendingReward, useZChefUserBalance } from "@/hooks/use-zchef-contract";
import { formatBalance } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { formatEther, formatUnits } from "viem";
import { useAccount } from "wagmi";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/stake")({
  component: RouteComponent,
});

const CHEF_ID = "2774204975865484998625983578957308881936129866247490838637631956688562044384";

function RouteComponent() {
  const { t } = useTranslation();
  const { address } = useAccount();
  const { data, isLoading, error, refetch } = useIncentiveStream(CHEF_ID);

  // Get user's staked balance and pending rewards
  const { data: stakedBalance } = useZChefUserBalance(BigInt(CHEF_ID));
  const { data: pendingRewards } = useZChefPendingReward(BigInt(CHEF_ID));

  // Fetch the ZAMM -> veZAMM redemption order
  const { data: order, refetch: refetchOrder, isLoading: orderLoading, error: orderError } = useRedemptionOrder();

  if (isLoading) {
    return (
      <div className="min-h-screen p-3 sm:p-6 pb-20">
        <div className="text-center">
          <div className="relative inline-block">
            <h2 className="font-mono font-bold text-xl sm:text-2xl uppercase tracking-[0.2em] inline-block px-6 py-3">
              [{t("common.stake")}]
            </h2>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-8">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted/20 border border-border"></div>
            <div className="h-24 bg-muted/20 border border-border"></div>
            <div className="h-48 bg-muted/20 border border-border"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen p-3 sm:p-6 pb-20">
        <div className="text-center">
          <div className="relative inline-block">
            <h2 className="font-mono font-bold text-xl sm:text-2xl uppercase tracking-[0.2em] inline-block px-6 py-3">
              [{t("common.stake")}]
            </h2>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-8">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <p className="font-mono text-red-400">
              [ERROR]: {error?.message || t("common.farm_not_found")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const userHasPosition = stakedBalance && stakedBalance > 0n;
  const userPosition = userHasPosition ? {
    shares: stakedBalance,
    pendingRewards: pendingRewards || 0n,
    totalDeposited: stakedBalance,
    totalHarvested: 0n,
  } : null;

  return (
    <div className="min-h-screen p-3 sm:p-6 pb-20">
      <div className="text-center mb-6 sm:mb-8">
        <div className="relative inline-block">
          <h2 className="font-mono font-bold text-xl sm:text-2xl uppercase tracking-[0.2em] inline-block px-6 py-3">
            [{t("common.stake")}]
          </h2>
        </div>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        {/* User Position Card */}
        {address && userPosition && (
          <div className="bg-card border-2 border-green-600 rounded-lg p-4 sm:p-6">
            <h3 className="font-mono font-bold text-lg text-green-500 mb-4">
              [{t("common.your_position")}]
            </h3>

            <div className="space-y-4">
              {/* Staked Amount */}
              <div className="flex justify-between items-center">
                <span className="font-mono text-muted-foreground">
                  {t("common.staked")}:
                </span>
                <span className="font-mono font-bold text-primary">
                  {formatBalance(formatEther(stakedBalance || 0n), "LP")}
                </span>
              </div>

              {/* Pending Rewards */}
              {pendingRewards !== undefined && data?.stream.rewardCoin && (
                <div className="flex justify-between items-center">
                  <span className="font-mono text-muted-foreground">
                    {t("common.pending_rewards")}:
                  </span>
                  <span className="font-mono font-bold text-green-500">
                    {formatBalance(
                      formatUnits(pendingRewards || 0n, data.stream.rewardCoin.decimals || 18),
                      data.stream.rewardCoin.symbol
                    )}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                <FarmHarvestDialog
                  stream={data.stream}
                  lpToken={data.lpToken}
                  trigger={
                    <Button
                      variant="outline"
                      className="w-full font-mono uppercase tracking-wider border-green-600 text-green-600 hover:bg-green-600/10"
                      disabled={!pendingRewards || pendingRewards === 0n}
                    >
                      [{t("common.harvest")}]
                    </Button>
                  }
                  onSuccess={refetch}
                />

                <FarmUnstakeDialog
                  stream={data.stream}
                  lpToken={data.lpToken}
                  userPosition={userPosition}
                  trigger={
                    <Button
                      variant="outline"
                      className="w-full font-mono uppercase tracking-wider border-orange-600 text-orange-600 hover:bg-orange-600/10"
                    >
                      [{t("common.unstake")}]
                    </Button>
                  }
                  onSuccess={refetch}
                />
              </div>
            </div>
          </div>
        )}

        {/* Incentive Stream Card */}
        <IncentiveStreamCard stream={data.stream} lpToken={data.lpToken} />

        {/* Redemption Card - Always show for debugging */}
        <div className="mt-6">
          {order ? (
            <RedemptionCard
              order={order}
              onOrderFilled={() => {
                refetchOrder();
                refetch();
              }}
            />
          ) : (
            <div className="bg-card border-2 border-yellow-600 rounded-lg p-6">
              <p className="font-mono text-yellow-500">
                {orderLoading ? "[Loading ZAMM → veZAMM redemption...]" : "[No active redemption available]"}
              </p>
              {orderError && <p className="font-mono text-red-500 mt-2">Error: {String(orderError)}</p>}
              {!orderLoading && !order && (
                <p className="font-mono text-xs text-muted-foreground mt-2">
                  Checking for ZAMM to veZAMM (ID: 87) redemption orders...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}