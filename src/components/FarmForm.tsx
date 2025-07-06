import { useState, ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWriteContract, usePublicClient, useAccount } from "wagmi";
import { formatEther, parseUnits, keccak256, encodePacked } from "viem";
import { mainnet } from "viem/chains";
import { TokenMeta, ETH_TOKEN } from "@/lib/coins";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { TokenSelector } from "@/components/TokenSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ZChefAddress, ZChefAbi } from "@/constants/zChef";
import { CoinsAddress, CoinsAbi } from "@/constants/Coins";
import { CookbookAddress, CookbookAbi } from "@/constants/Cookbook";
import { ZAMMAddress } from "@/constants/ZAAM";
import { useActiveIncentiveStreams, useUserIncentivePositions } from "@/hooks/use-incentive-streams";
import { useZChefActions } from "@/hooks/use-zchef-contract";
import { IncentiveStreamCard } from "@/components/IncentiveStreamCard";
import { FarmStakeDialog } from "@/components/FarmStakeDialog";
import { FarmUnstakeDialog } from "@/components/FarmUnstakeDialog";
import { FarmErrorBoundary } from "@/components/FarmErrorBoundary";
import { FarmGridSkeleton } from "@/components/FarmLoadingStates";
import { cn } from "@/lib/utils";

interface FarmFormData {
  selectedToken: TokenMeta | null;
  rewardToken: TokenMeta;
  rewardAmount: string;
  duration: string;
  mode: "create" | "manage";
}

const DURATION_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
  { value: "730", label: "730 days (2 years max)" },
];

export function FarmForm() {
  const { t } = useTranslation();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { tokens, isEthBalanceFetching } = useAllCoins();
  const { data: activeStreams, isLoading: isLoadingStreams } = useActiveIncentiveStreams();
  const { data: userPositions, isLoading: isLoadingPositions } = useUserIncentivePositions();
  const { harvest } = useZChefActions();

  const [formData, setFormData] = useState<FarmFormData>({
    selectedToken: null,
    rewardToken: tokens.find((t) => t.symbol !== "ETH" && t.id !== null) || ETH_TOKEN,
    rewardAmount: "",
    duration: "7",
    mode: "create",
  });
  const [activeTab, setActiveTab] = useState("browse");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "confirming" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  // Filter tokens to only show those with pools (liquidity > 0)
  const poolTokens = tokens.filter((token) => token.liquidity && token.liquidity > 0n);

  // Filter reward tokens to exclude ETH (not supported by zChef)
  const rewardTokens = tokens.filter((token) => token.symbol !== "ETH" && token.id !== null);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleRewardTokenSelect = (token: TokenMeta) => {
    setFormData((prev) => ({ ...prev, rewardToken: token }));
    if (errors.rewardToken) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.rewardToken;
        return newErrors;
      });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate selected token and pool
    if (!formData.selectedToken) {
      newErrors.selectedToken = "Please select a token with an LP pool";
    } else {
      const poolId = formData.selectedToken.poolId;
      const liquidity = formData.selectedToken.liquidity;

      if (!poolId || poolId === 0n) {
        newErrors.selectedToken = "Selected token has no valid liquidity pool";
      }
      if (!liquidity || liquidity === 0n) {
        newErrors.selectedToken = "Selected token pool has no liquidity";
      }
    }

    // Validate reward token (ETH not supported by zChef)
    if (!formData.rewardToken.id) {
      if (formData.rewardToken.symbol === "ETH") {
        newErrors.rewardToken = "ETH is not supported as a reward token";
      } else {
        newErrors.rewardToken = "Please select a reward token";
      }
    }

    // Validate reward amount
    if (!formData.rewardAmount || parseFloat(formData.rewardAmount) <= 0) {
      newErrors.rewardAmount = "Please enter a valid reward amount";
    } else {
      // Check user balance
      try {
        const decimals = formData.rewardToken.decimals || 18;
        const rewardAmountBigInt = parseUnits(formData.rewardAmount, decimals);
        const userBalance = formData.rewardToken.balance || 0n;
        if (rewardAmountBigInt > userBalance) {
          newErrors.rewardAmount = "Insufficient balance";
        }

        // Check for precision overflow (zChef requirement)
        const ACC_PRECISION = BigInt(1e12);
        if (rewardAmountBigInt > (2n ** 256n - 1n) / ACC_PRECISION) {
          newErrors.rewardAmount = "Reward amount too large - precision overflow";
        }
      } catch (error) {
        newErrors.rewardAmount = "Invalid reward amount format";
      }
    }

    // Validate duration
    if (!formData.duration) {
      newErrors.duration = "Please select a duration";
    } else {
      const durationDays = parseInt(formData.duration);
      if (durationDays > 730) {
        newErrors.duration = "Duration cannot exceed 730 days (2 years)";
      }
      if (durationDays <= 0) {
        newErrors.duration = "Duration must be positive";
      }

      // Check rate overflow (zChef requirement)
      if (formData.rewardAmount && durationDays > 0) {
        try {
          const decimals = formData.rewardToken.decimals || 18;
          const rewardAmountBigInt = parseUnits(formData.rewardAmount, decimals);
          const durationSeconds = BigInt(durationDays * 24 * 60 * 60);
          const ACC_PRECISION = BigInt(1e12);
          const rate = (rewardAmountBigInt * ACC_PRECISION) / durationSeconds;
          if (rate > 2n ** 128n - 1n) {
            newErrors.rewardAmount = "Calculated reward rate too large - reduce amount or increase duration";
          }
        } catch (error) {
          // Skip overflow check if calculation fails
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleApproveRewardToken = async () => {
    try {
      setIsSubmitting(true);

      const rewardId = formData.rewardToken.id;

      if (rewardId) {
        // For ERC6909 tokens (both ZAMM and Cookbook coins), use setOperator
        if (rewardId >= 1000000n) {
          // ZAMM coins: use setOperator on Coins contract
          const approvalHash = await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [ZChefAddress, true],
            chainId: mainnet.id,
          });

          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          }
        } else {
          // Cookbook coins: use setOperator on Cookbook contract
          const approvalHash = await writeContractAsync({
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "setOperator",
            args: [ZChefAddress, true],
            chainId: mainnet.id,
          });

          if (publicClient) {
            await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          }
        }
      } else {
        // For external ERC20 tokens, would need standard ERC20 approval
        // ETH is not supported as reward token by zChef
        console.log("ERC20 approval would be implemented here for external tokens");
        throw new Error("External ERC20 token approval not yet implemented");
      }
    } catch (error) {
      console.error("Approval failed:", error);
      setErrors({ approval: "Approval failed. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateFarm = async () => {
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      setTxStatus("pending");
      setTxError(null);

      if (!formData.selectedToken) {
        throw new Error("No LP token selected");
      }

      // Parse reward amount with proper decimals
      const decimals = formData.rewardToken.decimals || 18;
      const rewardAmount = parseUnits(formData.rewardAmount, decimals);

      // Validate duration and convert to seconds (uint64 safe)
      const durationDays = parseInt(formData.duration);
      const durationInSeconds = durationDays * 24 * 60 * 60;
      if (durationInSeconds > 2 ** 64 - 1) {
        throw new Error("Duration exceeds maximum allowed value");
      }
      const durationSeconds = BigInt(durationInSeconds);

      // Determine LP token contract and ID based on the pool ID range
      // Pool IDs < 1000000 are Cookbook pools, >= 1000000 are ZAMM pools
      const poolId = formData.selectedToken.poolId || 0n;
      const lpToken = poolId < 1000000n ? CookbookAddress : ZAMMAddress;
      const lpId = poolId;

      // Reward token contract and ID (ETH not supported by zChef)
      let rewardTokenAddress: `0x${string}`;
      const rewardId = formData.rewardToken.id || 0n;

      if (!formData.rewardToken.id) {
        // External ERC20 token (rewardId = 0 for ERC20)
        // Note: ETH is not supported by zChef contract
        throw new Error("External ERC20 tokens not yet supported");
      } else if (rewardId >= 1000000n) {
        // ZAMM coin - stored in Coins contract
        rewardTokenAddress = CoinsAddress;
      } else {
        // Cookbook coin - stored in Cookbook contract
        rewardTokenAddress = CookbookAddress;
      }

      // Generate unique bytes to prevent hash collisions
      const uniqueBytes = keccak256(
        encodePacked(
          ["address", "uint256", "uint256", "uint256"],
          [
            formData.selectedToken.token1 || "0x0000000000000000000000000000000000000000",
            BigInt(Date.now()),
            BigInt(Math.floor(Math.random() * 1000000)),
            rewardAmount,
          ],
        ),
      ) as `0x${string}`;

      const createStreamHash = await writeContractAsync({
        address: ZChefAddress,
        abi: ZChefAbi,
        functionName: "createStream",
        args: [lpToken, lpId, rewardTokenAddress, rewardId, rewardAmount, durationSeconds, uniqueBytes],
        // No value needed since ETH is not supported as reward token
        chainId: mainnet.id,
      });

      setTxHash(createStreamHash);
      setTxStatus("confirming");

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: createStreamHash as `0x${string}`,
        });
        console.log("Farm created successfully:", receipt);
        setTxStatus("success");

        // Reset form on success after delay
        setTimeout(() => {
          setFormData({
            selectedToken: null,
            rewardToken: tokens.find((t) => t.symbol !== "ETH" && t.id !== null) || ETH_TOKEN,
            rewardAmount: "",
            duration: "7",
            mode: "create",
          });
          setTxStatus("idle");
          setTxHash(null);
        }, 3000);
      }
    } catch (error: any) {
      console.error("Farm creation failed:", error);
      let errorMessage = "Farm creation failed. Please try again.";

      // Handle specific zChef contract errors
      if (error.message?.includes("ZeroAmount")) {
        errorMessage = "Amount cannot be zero";
      } else if (error.message?.includes("InvalidDuration")) {
        errorMessage = "Invalid duration specified";
      } else if (error.message?.includes("Exists")) {
        errorMessage = "Farm with these parameters already exists";
      } else if (error.message?.includes("PrecisionOverflow")) {
        errorMessage = "Reward amount too large - precision overflow";
      } else if (error.message?.includes("Overflow")) {
        errorMessage = "Calculated reward rate too large";
      } else if (error.message?.includes("TransferFromFailed")) {
        errorMessage = "Failed to transfer reward tokens - check approvals";
      } else if (error.message?.includes("User rejected")) {
        errorMessage = "Transaction rejected by user";
      } else if (error.message?.includes("insufficient funds")) {
        errorMessage = "Insufficient funds for transaction";
      }

      setTxStatus("error");
      setTxError(errorMessage);
      setErrors({ submit: errorMessage });

      setTimeout(() => {
        setTxStatus("idle");
        setTxError(null);
      }, 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const maxRewardAmount = formData.rewardToken.balance
    ? formData.rewardToken.decimals !== undefined && formData.rewardToken.decimals !== 18
      ? (Number(formData.rewardToken.balance) / 10 ** formData.rewardToken.decimals).toString()
      : formatEther(BigInt(formData.rewardToken.balance))
    : "0";

  // Removed unused handleStake function - staking is handled by FarmStakeDialog

  const handleHarvest = async (chefId: bigint) => {
    try {
      await harvest.mutateAsync({ chefId });
    } catch (error) {
      console.error("Harvest failed:", error);
    }
  };

  // Removed unused handleUnstake function - unstaking is handled by FarmUnstakeDialog

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 !p-3 sm:!p-6 !mb-[50px]">
      <div className="text-center mb-6 sm:mb-8">
        <div className="relative inline-block">
          <h2 className="font-mono font-bold text-xl sm:text-2xl uppercase tracking-[0.2em] border-2 border-primary inline-block px-6 py-3 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 backdrop-blur-sm shadow-lg">
            [{t("common.farm_alpha")}]
          </h2>
          <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 via-transparent to-primary/50 opacity-50 blur-sm -z-10"></div>
        </div>
        <p className="text-sm text-muted-foreground mt-3 font-mono tracking-wide">
          <span className="text-primary">&gt;</span> yield_farming.exe --mode=interactive --version=2.0
        </p>
        <div className="flex justify-center mt-4">
          <div className="h-px w-32 bg-gradient-to-r from-transparent via-primary to-transparent opacity-60"></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="relative mb-8">
            <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-background/80 via-background to-background/80 border-2 border-primary/60 p-1 backdrop-blur-sm shadow-xl">
              <TabsTrigger
                value="browse"
                className="font-mono text-sm sm:text-base font-medium border-r border-primary/40 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg hover:bg-primary/20 transition-all duration-200 tracking-wide"
              >
                <span className="hidden sm:inline">[</span>
                {t("common.browse_farms")}
                <span className="hidden sm:inline">]</span>
              </TabsTrigger>
              <TabsTrigger
                value="manage"
                className="font-mono text-sm sm:text-base font-medium border-r border-primary/40 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg hover:bg-primary/20 transition-all duration-200 tracking-wide"
              >
                <span className="hidden sm:inline">[</span>
                {t("common.my_farms")}
                <span className="hidden sm:inline">]</span>
              </TabsTrigger>
              <TabsTrigger
                value="create"
                className="font-mono text-sm sm:text-base font-medium data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg hover:bg-primary/20 transition-all duration-200 tracking-wide"
              >
                <span className="hidden sm:inline">[</span>
                {t("common.create_farm")}
                <span className="hidden sm:inline">]</span>
              </TabsTrigger>
            </TabsList>
            <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 via-transparent to-primary/20 opacity-30 blur-sm -z-10"></div>
          </div>

          <TabsContent value="browse" className="space-y-6 sm:space-y-8">
            <div className="space-y-5 sm:space-y-6">
              <div className="bg-gradient-to-r from-background/50 to-background/80 border border-primary/30 rounded-lg p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-mono text-lg">&gt;</span>
                    <h3 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                      {t("common.active_farms")}.list
                    </h3>
                    <div className="bg-primary/20 border border-primary/40 px-3 py-1 rounded">
                      <span className="text-primary font-mono text-sm font-bold">({activeStreams?.length || 0})</span>
                    </div>
                  </div>
                  <div className="hidden sm:block text-xs text-muted-foreground font-mono">
                    <span className="text-primary">STATUS:</span> SCANNING_STREAMS...
                  </div>
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
              </div>

              {isLoadingStreams ? (
                <FarmGridSkeleton count={6} />
              ) : activeStreams && activeStreams.length > 0 ? (
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {activeStreams.map((stream) => {
                    const lpToken = tokens.find((t) => t.poolId === stream.lpId);
                    return (
                      <div key={stream.chefId.toString()} className="group">
                        <FarmErrorBoundary>
                          {lpToken ? (
                            <FarmStakeDialog
                              stream={stream}
                              lpToken={lpToken}
                              trigger={
                                <div className="w-full cursor-pointer transform transition-all duration-200 hover:scale-[1.02] hover:shadow-xl">
                                  <IncentiveStreamCard stream={stream} />
                                </div>
                              }
                            />
                          ) : (
                            <div className="transform transition-all duration-200 hover:scale-[1.02] hover:shadow-xl">
                              <IncentiveStreamCard stream={stream} />
                            </div>
                          )}
                        </FarmErrorBoundary>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 sm:py-16">
                  <div className="bg-gradient-to-br from-muted/20 to-muted/5 border-2 border-dashed border-primary/30 rounded-xl p-8 backdrop-blur-sm">
                    <div className="font-mono text-muted-foreground space-y-4">
                      <div className="text-4xl sm:text-5xl opacity-20">◇</div>
                      <p className="text-xl font-bold text-primary">[ EMPTY_STREAMS ]</p>
                      <p className="text-sm mt-3">{t("common.no_active_farms")}</p>
                      <div className="bg-background/50 border border-primary/20 rounded p-3 mt-4">
                        <p className="text-xs opacity-60">$ farm --init --create-stream</p>
                        <p className="text-xs opacity-60">$ farm --list --active</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="manage" className="space-y-6 sm:space-y-8">
            <div className="space-y-5 sm:space-y-6">
              <div className="bg-gradient-to-r from-background/50 to-background/80 border border-primary/30 rounded-lg p-4 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-primary font-mono text-lg">&gt;</span>
                    <h3 className="font-mono font-bold text-base sm:text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                      {t("common.your_positions")}.dat
                    </h3>
                    <div className="bg-primary/20 border border-primary/40 px-3 py-1 rounded">
                      <span className="text-primary font-mono text-sm font-bold">({userPositions?.length || 0})</span>
                    </div>
                  </div>
                  {address && (
                    <div className="hidden sm:block text-xs text-muted-foreground font-mono">
                      <span className="text-primary">USER:</span> {address.slice(0, 6)}...{address.slice(-4)}
                    </div>
                  )}
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>
              </div>

              {!address ? (
                <div className="text-center py-12 sm:py-16">
                  <div className="bg-gradient-to-br from-primary/10 to-primary/5 border-2 border-dashed border-primary/50 rounded-xl p-8 backdrop-blur-sm">
                    <div className="font-mono text-foreground space-y-4">
                      <div className="text-4xl sm:text-5xl text-primary opacity-40">☉</div>
                      <p className="text-xl font-bold text-primary">[ AUTH_REQUIRED ]</p>
                      <p className="text-sm mt-3">{t("common.connect_wallet_to_view_positions")}</p>
                      <div className="bg-background/50 border border-primary/20 rounded p-3 mt-4">
                        <p className="text-xs opacity-60">$ wallet --connect --provider=injected</p>
                        <p className="text-xs opacity-60">$ auth --verify --chain=mainnet</p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : isLoadingPositions ? (
                <FarmGridSkeleton count={3} />
              ) : userPositions && userPositions.length > 0 ? (
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {userPositions.map((position) => {
                    const stream = activeStreams?.find((s) => s.chefId === position.chefId);
                    const lpToken = tokens.find((t) => t.poolId === stream?.lpId);

                    if (!stream) return null;

                    return (
                      <div key={position.chefId.toString()} className="group">
                        <FarmErrorBoundary>
                          <div className="bg-gradient-to-br from-background/80 to-background/60 border border-primary/30 rounded-lg p-1 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300">
                            <IncentiveStreamCard stream={stream} userPosition={position} showUserActions={false} />
                            <div className="p-3 border-t border-primary/20 bg-background/50">
                              <div className="flex flex-col sm:flex-row gap-2">
                                {lpToken && (
                                  <FarmStakeDialog
                                    stream={stream}
                                    lpToken={lpToken}
                                    trigger={
                                      <Button
                                        size="sm"
                                        className="flex-1 font-mono font-bold tracking-wide hover:scale-105 transition-transform"
                                      >
                                        [{t("common.stake_more")}]
                                      </Button>
                                    }
                                  />
                                )}
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleHarvest(position.chefId)}
                                    disabled={position.pendingRewards === 0n}
                                    className="flex-1 sm:flex-none font-mono font-bold tracking-wide hover:scale-105 transition-transform"
                                  >
                                    [{t("common.harvest")}]
                                  </Button>
                                  {userPositions && (
                                    <FarmUnstakeDialog
                                      stream={stream}
                                      userPosition={position}
                                      trigger={
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="flex-1 sm:flex-none font-mono font-bold tracking-wide hover:scale-105 transition-transform"
                                        >
                                          [{t("common.unstake")}]
                                        </Button>
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </FarmErrorBoundary>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12 sm:py-16">
                  <div className="bg-gradient-to-br from-muted/20 to-muted/5 border-2 border-dashed border-muted/40 rounded-xl p-8 backdrop-blur-sm">
                    <div className="font-mono text-muted-foreground space-y-4">
                      <div className="text-4xl sm:text-5xl opacity-20">○</div>
                      <p className="text-xl font-bold text-muted-foreground">[ NO_POSITIONS ]</p>
                      <p className="text-sm mt-3">{t("common.no_positions_found")}</p>
                      <div className="bg-background/50 border border-muted/20 rounded p-3 mt-4">
                        <p className="text-xs opacity-60">$ farm --stake --browse</p>
                        <p className="text-xs opacity-60">$ position --query --user={address?.slice(0, 6) || "null"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="create" className="space-y-6 sm:space-y-8">
            <div className="max-w-lg mx-auto space-y-6 sm:space-y-8 px-3 sm:px-0">
              <div className="bg-gradient-to-br from-background/80 to-background/60 border border-primary/30 rounded-xl p-6 backdrop-blur-sm shadow-xl">
                <div className="text-center mb-6">
                  <h3 className="font-mono font-bold text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    [{t("common.create_new_farm")}]
                  </h3>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">
                    <span className="text-primary">&gt;</span> initialize_stream --params=interactive
                  </p>
                  <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent mt-4"></div>
                </div>
                {/* LP Token Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
                    <span className="text-muted-foreground">&gt;</span> {t("common.select_token_with_lp_pool")}
                  </label>
                  <div className="bg-background/50 border border-primary/20 rounded-lg p-3">
                    <TokenSelector
                      selectedToken={formData.selectedToken || ETH_TOKEN}
                      tokens={poolTokens}
                      onSelect={(token) => setFormData((prev) => ({ ...prev, selectedToken: token }))}
                      isEthBalanceFetching={isEthBalanceFetching}
                    />
                  </div>
                  {errors.selectedToken && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                      <p className="text-sm text-red-400 font-mono">{errors.selectedToken}</p>
                    </div>
                  )}
                  {formData.selectedToken && (
                    <div className="bg-primary/10 border border-primary/20 rounded p-3">
                      <div className="text-xs font-mono space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Pool ID:</span>
                          <span className="text-primary font-bold">
                            {(formData.selectedToken.poolId || formData.selectedToken.id)?.toString() || "N/A"}
                          </span>
                        </div>
                        {formData.selectedToken.liquidity ? (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Liquidity:</span>
                            <span className="text-primary font-bold">
                              {formatEther(formData.selectedToken.liquidity)} ETH
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reward Token Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
                    <span className="text-muted-foreground">&gt;</span> {t("common.reward_token")}
                  </label>
                  <div className="bg-background/50 border border-primary/20 rounded-lg p-3">
                    <TokenSelector
                      selectedToken={formData.rewardToken}
                      tokens={rewardTokens}
                      onSelect={handleRewardTokenSelect}
                      isEthBalanceFetching={isEthBalanceFetching}
                    />
                  </div>
                  {errors.rewardToken && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                      <p className="text-sm text-red-400 font-mono">{errors.rewardToken}</p>
                    </div>
                  )}
                </div>

                {/* Reward Amount */}
                <div className="space-y-3">
                  <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
                    <span className="text-muted-foreground">&gt;</span> {t("common.reward_amount")}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      name="rewardAmount"
                      value={formData.rewardAmount}
                      onChange={handleInputChange}
                      placeholder="60000"
                      className="flex-1 font-mono bg-background/50 border-primary/20 focus:border-primary/50"
                      step="0.000001"
                      min="0"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFormData((prev) => ({ ...prev, rewardAmount: maxRewardAmount }))}
                      disabled={parseFloat(maxRewardAmount) === 0}
                      className="font-mono font-bold tracking-wide border-primary/30 hover:border-primary hover:bg-primary/20"
                    >
                      MAX
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <div className="bg-muted/20 border border-muted/30 rounded p-3">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-muted-foreground">Balance:</span>
                        <span className="text-primary font-bold">
                          {parseFloat(maxRewardAmount).toFixed(6)} {formData.rewardToken.symbol}
                        </span>
                      </div>
                    </div>
                    {formData.rewardAmount && formData.duration && parseFloat(formData.rewardAmount) > 0 && (
                      <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-lg p-4">
                        <p className="font-mono font-bold text-primary mb-3 text-sm">[EMISSION_PREVIEW]</p>
                        <div className="space-y-2 font-mono text-xs">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Per second:</span>
                            <span className="text-primary font-bold">
                              {(
                                parseFloat(formData.rewardAmount) /
                                (parseInt(formData.duration) * 24 * 60 * 60)
                              ).toFixed(8)}{" "}
                              {formData.rewardToken.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Per day:</span>
                            <span className="text-primary font-bold">
                              {(parseFloat(formData.rewardAmount) / parseInt(formData.duration)).toFixed(6)}{" "}
                              {formData.rewardToken.symbol}
                            </span>
                          </div>
                          <div className="flex justify-between font-bold">
                            <span className="text-muted-foreground">Total ({formData.duration}d):</span>
                            <span className="text-primary">
                              {parseFloat(formData.rewardAmount).toFixed(6)} {formData.rewardToken.symbol}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.rewardAmount && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                      <p className="text-sm text-red-400 font-mono">{errors.rewardAmount}</p>
                    </div>
                  )}
                </div>

                {/* Duration Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
                    <span className="text-muted-foreground">&gt;</span> {t("common.duration")}
                  </label>
                  <select
                    name="duration"
                    value={formData.duration}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border-2 border-primary/20 bg-background/50 text-foreground font-mono text-sm focus:outline-none focus:border-primary/50 rounded-lg backdrop-blur-sm"
                  >
                    {DURATION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.duration && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                      <p className="text-sm text-red-400 font-mono">{errors.duration}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-4 pt-4">
                  <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"></div>

                  {/* Approve Button - Show for ERC6909 tokens (ZAMM and Cookbook coins) */}
                  {formData.rewardToken.id ? (
                    <Button
                      onClick={handleApproveRewardToken}
                      disabled={isSubmitting}
                      className="w-full font-mono font-bold tracking-wide hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary/80 to-primary/60 hover:from-primary hover:to-primary/80"
                      variant="outline"
                    >
                      {isSubmitting
                        ? `[${t("common.approving")}...]`
                        : `[${t("common.approve")} ${formData.rewardToken.symbol}]`}
                    </Button>
                  ) : formData.rewardToken.symbol !== "ETH" ? (
                    <Button
                      disabled={true}
                      className="w-full font-mono font-bold tracking-wide opacity-50"
                      variant="outline"
                    >
                      [External ERC20 Approval - Not Supported]
                    </Button>
                  ) : null}

                  {/* Create Farm Button */}
                  <Button
                    onClick={handleCreateFarm}
                    disabled={isSubmitting || !validateForm()}
                    className="w-full font-mono font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg"
                  >
                    {isSubmitting ? `[${t("common.creating_farm")}...]` : `[${t("common.create_farm")}]`}
                  </Button>
                </div>

                {/* Transaction Monitoring */}
                {txStatus !== "idle" && (
                  <div
                    className={cn(
                      "border rounded-lg p-4 transition-all duration-300",
                      txStatus === "success"
                        ? "bg-green-500/10 border-green-500/30"
                        : txStatus === "error"
                          ? "bg-red-500/10 border-red-500/30"
                          : "bg-primary/10 border-primary/30",
                    )}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2">
                        {txStatus === "pending" && (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
                            <span className="font-mono font-bold text-primary">[PENDING]</span>
                          </>
                        )}
                        {txStatus === "confirming" && (
                          <>
                            <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                            <span className="font-mono font-bold text-yellow-500">[CONFIRMING]</span>
                          </>
                        )}
                        {txStatus === "success" && (
                          <>
                            <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                            <span className="font-mono font-bold text-green-500">[SUCCESS]</span>
                          </>
                        )}
                        {txStatus === "error" && (
                          <>
                            <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                            <span className="font-mono font-bold text-red-500">[ERROR]</span>
                          </>
                        )}
                      </div>

                      {txHash && (
                        <div className="text-center">
                          <a
                            href={`https://etherscan.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-background/50 border border-primary/20 rounded font-mono text-xs hover:bg-primary/10 transition-colors duration-200"
                          >
                            <span className="text-muted-foreground">TX:</span>
                            <span className="text-primary font-bold">
                              {txHash.slice(0, 6)}...{txHash.slice(-4)}
                            </span>
                            <span className="text-muted-foreground">↗</span>
                          </a>
                        </div>
                      )}

                      {txError && (
                        <div className="text-center">
                          <p className="text-sm text-red-400 font-mono break-words">{txError}</p>
                        </div>
                      )}

                      {txStatus === "success" && (
                        <div className="text-center">
                          <p className="text-sm text-green-400 font-mono">
                            Farm created successfully! Check the Browse tab to see your new farm.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Error Display */}
                {(errors.approval || errors.submit) && txStatus === "idle" && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    <div className="text-sm text-red-400 text-center font-mono break-words">
                      [ERROR]: {errors.approval || errors.submit}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
