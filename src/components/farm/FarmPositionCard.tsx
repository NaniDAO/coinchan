import type { IncentiveStream, IncentiveUserPosition } from "@/hooks/use-incentive-streams";
import { useZChefPendingReward, useZChefUserBalance } from "@/hooks/use-zchef-contract";
import { ETH_TOKEN, JPYC_FARM_CHEF_ID, type TokenMeta } from "@/lib/coins";
import { formatBalance, formatNumber } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { useETHPrice } from "@/hooks/use-eth-price";
import { useReserves } from "@/hooks/use-reserves";
import { useErc20Metadata } from "@/hooks/use-erc20-metadata";
import { useErc20Price } from "@/hooks/use-erc20-price";
import { memo, useMemo } from "react";

// Hardcoded ZAMM pool ID for price calculations
const ZAMM_POOL_ID = 22979666169544372205220120853398704213623237650449182409187385558845249460832n;
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

export const FarmPositionCard = memo(function FarmPositionCard({
  position,
  stream,
  lpToken,
  onHarvest,
  isHarvesting,
}: FarmPositionCardProps) {
  const { t } = useTranslation();
  const { data: ethPrice } = useETHPrice();

  // Get real-time pending rewards from contract
  const { data: onchainPendingRewards } = useZChefPendingReward(stream.chefId);
  const actualPendingRewards = onchainPendingRewards ?? position.pendingRewards;

  // Get real-time user balance from contract
  const { data: onchainUserBalance } = useZChefUserBalance(stream.chefId);
  const actualUserShares = onchainUserBalance ?? position.shares;

  // Check if reward is ERC20 (rewardId === 0n)
  // Also handle JPYC farm specifically since it uses DAI rewards but may have non-zero rewardId
  const isErc20Reward =
    stream.rewardId === 0n || String(stream.rewardId) === "0" || BigInt(stream.chefId) === JPYC_FARM_CHEF_ID;

  // Get ERC20 metadata (symbol, decimals) for ERC20 rewards
  const {
    symbol: erc20Symbol,
    decimals: erc20Decimals,
    isLoading: isMetadataLoading,
  } = useErc20Metadata({
    tokenAddress: isErc20Reward ? (stream.rewardToken as `0x${string}`) : undefined,
  });

  // Get ERC20 price from Chainlink for USD value calculation
  const { data: erc20Price } = useErc20Price({
    tokenAddress: isErc20Reward ? (stream.rewardToken as `0x${string}`) : undefined,
  });

  // Hardcoded DAI metadata as fallback (DAI mainnet address)
  const DAI_ADDRESS = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
  const isDaiToken = stream.rewardToken?.toLowerCase() === DAI_ADDRESS.toLowerCase();

  // For ERC20 rewards, ALWAYS prioritize the ERC20 metadata over indexer data
  // If still loading, show "Loading..." instead of wrong symbol from indexer
  // For DAI specifically, use hardcoded values as ultimate fallback
  const rewardSymbol = useMemo(() => {
    if (isErc20Reward) {
      return erc20Symbol || (isDaiToken ? "DAI" : isMetadataLoading ? "..." : "ERC20");
    }
    return stream.rewardCoin?.symbol || "???";
  }, [isErc20Reward, erc20Symbol, isDaiToken, isMetadataLoading, stream.rewardCoin?.symbol]);

  const rewardDecimals = useMemo(() => {
    if (isErc20Reward) {
      return erc20Decimals || (isDaiToken ? 18 : 18);
    }
    return stream.rewardCoin?.decimals || 18;
  }, [isErc20Reward, erc20Decimals, isDaiToken, stream.rewardCoin?.decimals]);

  // Fetch ZAMM reserves if reward token is ZAMM
  const isZAMMReward = stream.rewardCoin?.symbol === "ZAMM";
  const { data: zammReserves } = useReserves({
    poolId: isZAMMReward ? ZAMM_POOL_ID : undefined,
    source: "ZAMM",
  });
  // Determine if this is an expired farm
  const currentTime = BigInt(Math.floor(Date.now() / 1000));
  const isExpired = stream.endTime <= currentTime;

  return (
    <div className="bg-card text-card-foreground border-2 border-border transition-all h-full group relative overflow-hidden">
      {isExpired && (
        <div className="absolute top-2 right-2 z-10 px-2 py-1 bg-yellow-600/90 text-white text-xs font-mono uppercase">
          [{t("common.expired")}]
        </div>
      )}
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
              <div className="text-left sm:text-right">
                <span className="font-mono font-bold text-green-600">
                  {formatBalance(formatUnits(actualPendingRewards, rewardDecimals), rewardSymbol)}
                </span>
                {ethPrice?.priceUSD &&
                isZAMMReward &&
                zammReserves?.reserve0 &&
                zammReserves?.reserve1 &&
                zammReserves.reserve0 > 0n &&
                zammReserves.reserve1 > 0n ? (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ≈ ${(() => {
                      const rewardAmount = parseFloat(formatEther(actualPendingRewards));
                      const ethReserve = parseFloat(formatEther(zammReserves.reserve0));
                      const zammReserve = parseFloat(formatEther(zammReserves.reserve1));
                      const zammPriceInEth = ethReserve / zammReserve;
                      const zammPriceUsd = zammPriceInEth * ethPrice.priceUSD;
                      return formatNumber(rewardAmount * zammPriceUsd, 2);
                    })()} USD
                  </div>
                ) : ethPrice?.priceUSD && isErc20Reward && erc20Price && actualPendingRewards > 0n ? (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    ≈ ${(() => {
                      const rewardAmount = parseFloat(formatUnits(actualPendingRewards, rewardDecimals));
                      const tokenPriceUsd = erc20Price * ethPrice.priceUSD;
                      return formatNumber(rewardAmount * tokenPriceUsd, 2);
                    })()} USD
                  </div>
                ) : null}
              </div>
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
});
