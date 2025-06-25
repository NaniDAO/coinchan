import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { formatEther, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGetAccount, type AccountCoinsBalanceOf } from "@/hooks/use-get-account";
import { useGetLockups, type LockupData } from "@/hooks/use-get-lockups";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { TokenImage } from "@/components/TokenImage";
import { ETH_TOKEN, type TokenMeta } from "@/lib/coins";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";

export function UserPage() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const [unlockingLockup, setUnlockingLockup] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const {
    data: accountData,
    isLoading: isLoadingAccount,
    error: accountError,
  } = useGetAccount({ address });

  const {
    data: lockupsData,
    isLoading: isLoadingLockups,
    error: lockupsError,
    refetch: refetchLockups,
  } = useGetLockups({ address });

  const formatBalance = (balance: string, decimals?: number) => {
    try {
      const bigintBalance = BigInt(balance);
      if (decimals === 6) {
        return formatUnits(bigintBalance, 6);
      }
      return formatEther(bigintBalance);
    } catch {
      return "0";
    }
  };

  const formatTokenName = (balance: AccountCoinsBalanceOf) => {
    if (balance.coin?.symbol && balance.coin?.name) {
      return `${balance.coin.symbol} (${balance.coin.name})`;
    }
    return balance.coin?.symbol || balance.coin?.name || `Token #${balance.coinId}`;
  };

  const balanceToTokenMeta = (balance: AccountCoinsBalanceOf): TokenMeta => ({
    id: BigInt(balance.coinId),
    symbol: balance.coin?.symbol || `Token${balance.coinId}`,
    name: balance.coin?.name || `Token ${balance.coinId}`,
    decimals: balance.coin?.decimals || 18,
    balance: BigInt(balance.balance),
    source: "COOKBOOK" as const,
  });

  const lockupToTokenMeta = (lockup: LockupData): TokenMeta => {
    // ETH lockup
    if (lockup.token === "0x0000000000000000000000000000000000000000" || lockup.coinId === "0") {
      return ETH_TOKEN;
    }
    // Token lockup
    return {
      id: lockup.coinId ? BigInt(lockup.coinId) : null,
      symbol: lockup.coin?.symbol || `Token${lockup.coinId}`,
      name: lockup.coin?.name || `Token ${lockup.coinId}`,
      decimals: lockup.coin?.decimals || 18,
      source: "COOKBOOK" as const,
    };
  };

  const formatLockupAsset = (lockup: LockupData) => {
    // ETH lockup
    if (lockup.token === "0x0000000000000000000000000000000000000000" || lockup.coinId === "0") {
      return "ETH";
    }
    // Token lockup
    if (lockup.coin?.symbol && lockup.coin?.name) {
      return `${lockup.coin.symbol} (${lockup.coin.name})`;
    }
    return lockup.coin?.symbol || lockup.coin?.name || `Token #${lockup.coinId}`;
  };

  const formatLockupAmount = (lockup: LockupData) => {
    if (!lockup.amount) return "0";
    
    try {
      const bigintAmount = BigInt(lockup.amount);
      // ETH
      if (lockup.token === "0x0000000000000000000000000000000000000000" || lockup.coinId === "0") {
        return formatEther(bigintAmount);
      }
      // Token with decimals
      if (lockup.coin?.decimals === 6) {
        return formatUnits(bigintAmount, 6);
      }
      return formatEther(bigintAmount);
    } catch {
      return "0";
    }
  };

  const isLockupExpired = (unlockTime: string | null) => {
    if (!unlockTime) return false;
    const unlockTimestamp = parseInt(unlockTime) * 1000; // Convert to milliseconds
    return Date.now() > unlockTimestamp;
  };

  const formatUnlockTime = (unlockTime: string | null) => {
    if (!unlockTime) return "Unknown";
    const unlockTimestamp = parseInt(unlockTime) * 1000;
    return new Date(unlockTimestamp).toLocaleString();
  };

  const handleUnlock = async (lockup: LockupData) => {
    if (!address || !isConnected || !lockup.unlockTime) return;

    setUnlockingLockup(lockup.id);
    setUnlockError(null);

    try {
      const token = lockup.token || "0x0000000000000000000000000000000000000000";
      const to = lockup.to || address;
      const id = lockup.coinId ? BigInt(lockup.coinId) : 0n;
      const amount = lockup.amount ? BigInt(lockup.amount) : 0n;
      const unlockTime = BigInt(lockup.unlockTime);

      console.log("Unlocking lockup:", {
        token,
        to,
        id: id.toString(),
        amount: amount.toString(),
        unlockTime: unlockTime.toString(),
      });

      const hash = await writeContractAsync({
        account: address,
        chainId: mainnet.id,
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "unlock",
        args: [token as `0x${string}`, to as `0x${string}`, id, amount, unlockTime],
      });

      console.log("Unlock transaction:", hash);
      
      // Refetch lockups after successful unlock
      setTimeout(() => {
        refetchLockups();
      }, 2000);
    } catch (error) {
      console.error("Unlock error:", error);
      
      if (isUserRejectionError(error)) {
        setUnlockError("Transaction rejected by user");
      } else {
        const errorMsg = handleWalletError(error) || "Failed to unlock";
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
          <h2 className="text-xl font-bold mb-4">USER DASHBOARD</h2>
          <p className="text-muted-foreground">
            Please connect your wallet to view your balances and lockups.
          </p>
        </div>
      </div>
    );
  }

  const allLockups = [
    ...(lockupsData?.lockupSent?.items || []).map(lockup => ({ ...lockup, type: 'sent' as const })),
    ...(lockupsData?.lockupReceived?.items || []).map(lockup => ({ ...lockup, type: 'received' as const })),
  ].sort((a, b) => parseInt(b.createdAt) - parseInt(a.createdAt));

  return (
    <div className="p-6 bg-background text-foreground">
      <div className="max-w-4xl border-2 border-border p-4 outline outline-offset-2 outline-border mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">USER DASHBOARD</h1>
        
        <div className="mb-4 text-sm text-muted-foreground text-center">
          Connected: {address}
        </div>

        <Tabs defaultValue="balances" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="balances" className="text-sm font-bold">
              BALANCES
            </TabsTrigger>
            <TabsTrigger value="lockups" className="text-sm font-bold">
              LOCKUPS ({allLockups.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balances" className="mt-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold">TOKEN BALANCES</h2>
              
              {isLoadingAccount ? (
                <div className="flex justify-center py-8">
                  <LoadingLogo />
                </div>
              ) : accountError ? (
                <div className="text-destructive text-center py-4">
                  Error loading balances: {accountError.message}
                </div>
              ) : !accountData?.coinsBalanceOf?.items?.length ? (
                <div className="text-muted-foreground text-center py-8">
                  No token balances found
                </div>
              ) : (
                <div className="space-y-2">
                  {accountData.coinsBalanceOf.items
                    .filter(balance => BigInt(balance.balance) > 0n)
                    .map((balance) => (
                      <div
                        key={`${balance.coinId}-${balance.address}`}
                        className="flex items-center justify-between p-3 border border-border rounded bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <TokenImage
                            token={balanceToTokenMeta(balance)}
                          />
                          <div>
                            <div className="font-bold">
                              {formatTokenName(balance)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ID: {balance.coinId}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">
                            {formatBalance(balance.balance, balance.coin?.decimals)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {balance.coin?.symbol || "tokens"}
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
              <h2 className="text-lg font-bold">LOCKUPS</h2>
              
              {isLoadingLockups ? (
                <div className="flex justify-center py-8">
                  <LoadingLogo />
                </div>
              ) : lockupsError ? (
                <div className="text-destructive text-center py-4">
                  Error loading lockups: {lockupsError.message}
                </div>
              ) : !allLockups.length ? (
                <div className="text-muted-foreground text-center py-8">
                  No lockups found
                </div>
              ) : (
                <div className="space-y-3">
                  {allLockups.map((lockup) => {
                    const expired = isLockupExpired(lockup.unlockTime);
                    const canUnlock = expired && lockup.type === 'received';
                    const isUnlocking = unlockingLockup === lockup.id;
                    
                    return (
                      <div
                        key={lockup.id}
                        className="p-4 border border-border rounded bg-card"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0">
                              <TokenImage
                                token={lockupToTokenMeta(lockup)}
                              />
                            </div>
                            <div>
                              <div className="font-bold text-sm">
                                {formatLockupAsset(lockup)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {lockup.type === 'sent' ? 'Sent to' : 'Received from'}: {' '}
                                {lockup.type === 'sent' 
                                  ? `${lockup.to?.slice(0, 6)}...${lockup.to?.slice(-4)}`
                                  : `${lockup.sender.slice(0, 6)}...${lockup.sender.slice(-4)}`
                                }
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-sm">
                              {formatLockupAmount(lockup)}
                            </div>
                            <div className={`text-xs ${expired ? 'text-green-500' : 'text-orange-500'}`}>
                              {expired ? 'UNLOCKED' : 'LOCKED'}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-xs text-muted-foreground mb-3">
                          Unlock time: {formatUnlockTime(lockup.unlockTime)}
                        </div>
                        
                        {canUnlock && (
                          <button
                            onClick={() => handleUnlock(lockup)}
                            disabled={isUnlocking || isPending}
                            className="w-full py-2 text-sm font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted rounded flex items-center justify-center gap-2"
                          >
                            {isUnlocking ? (
                              <>
                                <LoadingLogo size="sm" />
                                <span>UNLOCKING</span>
                              </>
                            ) : (
                              <>
                                <span>UNLOCK</span>
                                <span>🔓</span>
                              </>
                            )}
                          </button>
                        )}
                        
                        {!expired && lockup.type === 'received' && (
                          <div className="text-xs text-muted-foreground text-center py-2">
                            Unlock available after expiry
                          </div>
                        )}
                      </div>
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