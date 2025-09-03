import { TokenImage } from "@/components/TokenImage";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { type LockupData, useGetLockups } from "@/hooks/use-get-lockups";
import { useLockupStatus } from "@/hooks/use-lockup-status";
import { useUserPortfolio } from "@/hooks/use-user-portfolio";
import { ETH_TOKEN, type TokenMeta } from "@/lib/coins";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { trunc } from "@/lib/utils";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, useWriteContract } from "wagmi";

export function UserPage() {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [unlockingLockup, setUnlockingLockup] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const {
    data: portfolioData,
    isLoading: isLoadingPortfolio,
    error: portfolioError,
  } = useUserPortfolio({ address: address! });

  const {
    data: lockupsData,
    isLoading: isLoadingLockups,
    error: lockupsError,
    refetch: refetchLockups,
  } = useGetLockups({ address });

  // Get all lockups to check their status
  const allLockups = [
    ...(lockupsData?.lockupSent?.items || []).map((lockup) => ({
      ...lockup,
      type: "sent" as const,
    })),
    ...(lockupsData?.lockupReceived?.items || []).map((lockup) => ({
      ...lockup,
      type: "received" as const,
    })),
  ];

  const formatBalance = (balance: string, decimals?: number) => {
    try {
      const bigintBalance = BigInt(balance);

      if (bigintBalance === 0n) return "0";

      // Use TokenSelector formatting logic
      if (decimals === 6) {
        const tokenValue = Number(formatUnits(bigintBalance, 6));
        if (tokenValue >= 1000) {
          return `${Math.floor(tokenValue).toLocaleString()}`;
        } else if (tokenValue >= 1) {
          return tokenValue.toFixed(3);
        } else if (tokenValue >= 0.001) {
          return tokenValue.toFixed(4);
        } else if (tokenValue >= 0.0001) {
          return tokenValue.toFixed(6);
        } else if (tokenValue > 0) {
          return tokenValue.toExponential(2);
        }
        return "0";
      }

      // Standard 18 decimal formatting
      const tokenValue = Number(formatEther(bigintBalance));
      if (tokenValue >= 1000) {
        return `${Math.floor(tokenValue).toLocaleString()}`;
      } else if (tokenValue >= 1) {
        return tokenValue.toFixed(4);
      } else if (tokenValue >= 0.001) {
        return tokenValue.toFixed(6);
      } else if (tokenValue >= 0.0000001) {
        return tokenValue.toFixed(8);
      } else if (tokenValue > 0) {
        return tokenValue.toExponential(4);
      }
      return "0";
    } catch {
      return "0";
    }
  };

  const formatBalanceFromAPI = (balance: string, decimals: number) => {
    return formatBalance(balance, decimals);
  };

  const formatPositionShares = (shares: string, decimals: number = 18) => {
    return formatBalance(shares, decimals);
  };

  const formatPendingRewards = (rewards: string, decimals: number = 18) => {
    return formatBalance(rewards, decimals);
  };

  const isLockupExpired = (unlockTime: string | null) => {
    if (!unlockTime) return false;
    const unlockTimestamp = Number.parseInt(unlockTime) * 1000; // Convert to milliseconds
    return Date.now() > unlockTimestamp;
  };

  const handleUnlock = async (lockup: LockupData) => {
    if (!address || !isConnected || !lockup.unlockTime) return;

    setUnlockingLockup(lockup.id);
    setUnlockError(null);

    try {
      const token =
        lockup.token || "0x0000000000000000000000000000000000000000";
      const to = lockup.to || address;
      // Fix coin ID logic - for ETH lockups, always use 0n
      // For token lockups, use the actual coin ID
      const id =
        lockup.token === "0x0000000000000000000000000000000000000000"
          ? 0n
          : lockup.coinId
            ? BigInt(lockup.coinId)
            : 0n;
      const amount = lockup.amount ? BigInt(lockup.amount) : 0n;
      const unlockTime = BigInt(lockup.unlockTime);

      await writeContractAsync({
        account: address,
        chainId: mainnet.id,
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "unlock",
        args: [
          token as `0x${string}`,
          to as `0x${string}`,
          id,
          amount,
          unlockTime,
        ],
      });

      // Refetch lockups after successful unlock
      setTimeout(() => {
        refetchLockups();
      }, 2000);
    } catch (error) {
      console.error("Unlock error:", error);

      if (isUserRejectionError(error)) {
        setUnlockError(t("errors.user_denied"));
      } else {
        const errorMsg = handleWalletError(error, { t }) || t("unlock_failed");
        setUnlockError(errorMsg);
      }
    } finally {
      setUnlockingLockup(null);
    }
  };

  if (!isConnected) {
    return (
      <div className="p-6 bg-background text-foreground">
        <div className="max-w-lg border-2 border-border p-4 outline outline-offset-2 outline-border mx-auto text-center">
          <h2 className="text-xl font-bold mb-4">
            {t("lockup.user_dashboard").toUpperCase()}
          </h2>
          <p className="text-muted-foreground">
            {t("lockup.connect_wallet_message")}
          </p>
        </div>
      </div>
    );
  }

  const sortedLockups = allLockups.sort(
    (a, b) => Number.parseInt(b.createdAt) - Number.parseInt(a.createdAt),
  );

  return (
    <div className="p-6 bg-background text-foreground">
      <div className="border-2 border-double border-border p-4 outline outline-offset-2 outline-border mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">
          {t("lockup.user_dashboard").toUpperCase()}
        </h1>

        <div className="mb-4 text-sm text-muted-foreground text-center">
          {t("lockup.connected")} {address}
        </div>

        <Tabs defaultValue="balances" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="balances" className="text-sm font-bold">
              {t("lockup.balances").toUpperCase()}
            </TabsTrigger>
            <TabsTrigger value="positions" className="text-sm font-bold">
              POSITIONS ({portfolioData?.positions?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="lockups" className="text-sm font-bold">
              {t("lockup.lockups_count", {
                count: allLockups.length,
              }).toUpperCase()}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balances" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold">
                {t("lockup.token_balances").toUpperCase()}
              </h2>

              {isLoadingPortfolio ? (
                <div className="flex justify-center py-8">
                  <LoadingLogo />
                </div>
              ) : portfolioError ? (
                <div className="text-destructive text-center py-4">
                  {t("lockup.error_loading_balances")} {portfolioError.message}
                </div>
              ) : !portfolioData?.balances?.length ? (
                <div className="text-muted-foreground text-center py-8">
                  {t("lockup.no_token_balances")}
                </div>
              ) : (
                <div className="space-y-2">
                  {portfolioData.balances.map((balance) => (
                    <div
                      key={balance.coin_id}
                      className="flex items-center justify-between p-3 border border-border rounded bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <TokenImage
                          imageUrl={null}
                          symbol={balance.coin_symbol}
                        />
                        <div>
                          <div className="font-bold">
                            {balance.coin_symbol &&
                            balance.coin_name &&
                            balance.coin_symbol !== balance.coin_name
                              ? `${balance.coin_symbol} (${balance.coin_name})`
                              : balance.coin_symbol ||
                                balance.coin_name ||
                                `Token #${balance.coin_id}`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            ID: {balance.coin_id} • {balance.coin_decimals}{" "}
                            decimals
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">
                          {formatBalanceFromAPI(
                            balance.balance,
                            balance.coin_decimals,
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {balance.coin_symbol || "tokens"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="positions" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold">POSITIONS</h2>

              {isLoadingPortfolio ? (
                <div className="flex justify-center py-8">
                  <LoadingLogo />
                </div>
              ) : portfolioError ? (
                <div className="text-destructive text-center py-4">
                  Error loading positions: {portfolioError.message}
                </div>
              ) : !portfolioData?.positions?.length ? (
                <div className="text-muted-foreground text-center py-8">
                  No positions found
                </div>
              ) : (
                <div className="space-y-2">
                  {portfolioData.positions.map((position) => (
                    <div
                      key={`${position.chef_id}-${position.lp_id}`}
                      className="p-3 border border-border rounded bg-card"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-xs text-muted-foreground">
                            Chef #{trunc(position.chef_id, 6)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-sm">
                            {formatPositionShares(position.shares)} shares
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          Reward: {position.reward_symbol} (ID:{" "}
                          {position.reward_id})
                        </div>
                        <div className="text-xs text-green-500">
                          {formatPendingRewards(position.pending_rewards)}{" "}
                          pending
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="lockups" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold">
                {t("lockup.lockups").toUpperCase()}
              </h2>

              {isLoadingLockups ? (
                <div className="flex justify-center py-8">
                  <LoadingLogo />
                </div>
              ) : lockupsError ? (
                <div className="text-destructive text-center py-4">
                  {t("lockup.error_loading_lockups")} {lockupsError.message}
                </div>
              ) : !sortedLockups.length ? (
                <div className="text-muted-foreground text-center py-8">
                  {t("lockup.no_lockups")}
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedLockups.map((lockup) => {
                    const expired = isLockupExpired(lockup.unlockTime);
                    const isUnlocking = unlockingLockup === lockup.id;

                    return (
                      <LockupItem
                        key={lockup.id}
                        lockup={lockup}
                        expired={expired}
                        isUnlocking={isUnlocking}
                        userAddress={address}
                        onUnlock={handleUnlock}
                        isPending={isPending}
                      />
                    );
                  })}
                </div>
              )}

              {unlockError && (
                <div className="mt-4 p-3 border-2 border-destructive bg-card">
                  <p className="text-sm font-bold text-destructive">
                    ⚠ ERROR: {unlockError}
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Separate component for each lockup item to use the hook
function LockupItem({
  lockup,
  expired,
  isUnlocking,
  userAddress,
  onUnlock,
  isPending,
}: {
  lockup: LockupData & { type: "sent" | "received" };
  expired: boolean;
  isUnlocking: boolean;
  userAddress?: `0x${string}`;
  onUnlock: (lockup: LockupData) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const { isActuallyUnlocked } = useLockupStatus(lockup, userAddress);

  const canUnlock =
    expired &&
    (lockup.type === "received" || lockup.type === "sent") &&
    !isActuallyUnlocked;

  const lockupToTokenMeta = (lockup: LockupData): TokenMeta => {
    // ETH lockup - check token address first
    if (lockup.token === "0x0000000000000000000000000000000000000000") {
      return ETH_TOKEN;
    }
    // Token lockup
    return {
      id: lockup.coinId ? BigInt(lockup.coinId) : null,
      symbol: lockup.coin?.symbol || `Token${lockup.coinId}`,
      name: lockup.coin?.name || `Token ${lockup.coinId}`,
      decimals: lockup.coin?.decimals || 18,
      source: "COOKBOOK" as const,
      tokenUri: lockup.coin?.imageUrl || undefined,
    };
  };

  const formatLockupAsset = (lockup: LockupData) => {
    // ETH lockup - check token address first
    if (lockup.token === "0x0000000000000000000000000000000000000000") {
      return "ETH";
    }
    // Token lockup
    if (lockup.coin?.symbol && lockup.coin?.name) {
      return `${lockup.coin.symbol} (${lockup.coin.name})`;
    }
    return (
      lockup.coin?.symbol || lockup.coin?.name || `Token #${lockup.coinId}`
    );
  };

  const formatLockupAmount = (lockup: LockupData) => {
    if (!lockup.amount) return "0";

    try {
      const bigintAmount = BigInt(lockup.amount);

      if (bigintAmount === 0n) return "0";

      // ETH - check token address first
      if (lockup.token === "0x0000000000000000000000000000000000000000") {
        const ethValue = Number(formatEther(bigintAmount));
        if (ethValue >= 1000) {
          return `${Math.floor(ethValue).toLocaleString()}`;
        } else if (ethValue >= 1) {
          return ethValue.toFixed(4);
        } else if (ethValue >= 0.001) {
          return ethValue.toFixed(6);
        } else if (ethValue >= 0.0000001) {
          return ethValue.toFixed(8);
        } else if (ethValue > 0) {
          return ethValue.toExponential(4);
        }
        return "0";
      }

      // Token with decimals
      const decimals = lockup.coin?.decimals || 18;
      const tokenValue = Number(formatUnits(bigintAmount, decimals));

      if (tokenValue >= 1000) {
        return `${Math.floor(tokenValue).toLocaleString()}`;
      } else if (tokenValue >= 1) {
        return tokenValue.toFixed(3);
      } else if (tokenValue >= 0.001) {
        return tokenValue.toFixed(4);
      } else if (tokenValue >= 0.0001) {
        return tokenValue.toFixed(6);
      } else if (tokenValue > 0) {
        return tokenValue.toExponential(2);
      }
      return "0";
    } catch {
      return "0";
    }
  };

  const formatUnlockTime = (unlockTime: string | null) => {
    if (!unlockTime) return "Unknown";
    const unlockTimestamp = Number.parseInt(unlockTime) * 1000;
    return new Date(unlockTimestamp).toLocaleString();
  };

  return (
    <div className="p-4 border border-border rounded bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0">
            <TokenImage
              imageUrl={lockupToTokenMeta(lockup).imageUrl}
              symbol={lockupToTokenMeta(lockup).symbol}
            />
          </div>
          <div>
            <div className="font-bold text-sm">{formatLockupAsset(lockup)}</div>
            <div className="text-xs text-muted-foreground">
              {lockup.type === "sent"
                ? t("lockup.sent_to")
                : t("lockup.received_from")}
              :{" "}
              {lockup.type === "sent"
                ? `${lockup.to?.slice(0, 6)}...${lockup.to?.slice(-4)}`
                : `${lockup.sender.slice(0, 6)}...${lockup.sender.slice(-4)}`}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">{formatLockupAmount(lockup)}</div>
          <div
            className={`text-xs ${
              isActuallyUnlocked
                ? "text-blue-500"
                : expired
                  ? "text-green-500"
                  : "text-orange-500"
            }`}
          >
            {isActuallyUnlocked
              ? t("lockup.claimed").toUpperCase()
              : expired
                ? t("lockup.unlockable").toUpperCase()
                : t("lockup.locked").toUpperCase()}
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground mb-3">
        {t("lockup.unlock_time_label")} {formatUnlockTime(lockup.unlockTime)}
      </div>

      {canUnlock && (
        <button
          onClick={() => onUnlock(lockup)}
          disabled={isUnlocking || isPending}
          className="w-full py-2 text-sm font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted rounded flex items-center justify-center gap-2"
        >
          {isUnlocking ? (
            <>
              <LoadingLogo size="sm" />
              <span>{t("lockup.unlocking").toUpperCase()}</span>
            </>
          ) : (
            <>
              <span>
                {lockup.type === "sent"
                  ? t("lockup.unlock_for_recipient").toUpperCase()
                  : t("lockup.unlock").toUpperCase()}
              </span>
              <span>🔓</span>
            </>
          )}
        </button>
      )}

      {!expired && (
        <div className="text-xs text-muted-foreground text-center py-2">
          {t("lockup.unlock_available_after_expiry")}
        </div>
      )}

      {isActuallyUnlocked && (
        <div className="text-xs text-blue-500 text-center py-2">
          ✓ {t("lockup.already_claimed")}
        </div>
      )}
    </div>
  );
}
