import { TokenSelector } from "@/components/TokenSelector";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/button";
import { encodePacked, formatEther, keccak256, parseUnits } from "viem";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ChangeEvent, useMemo, useState } from "react";
import { ETH_TOKEN, TokenMeta } from "@/lib/coins";
import { usePublicClient, useWriteContract } from "wagmi";
import { useAllCoins } from "@/hooks/metadata/use-all-coins";
import { ZChefAbi, ZChefAddress } from "@/constants/zChef";
import { mainnet } from "viem/chains";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { ZAMMAddress } from "@/constants/ZAAM";

const DURATION_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "365 days" },
  { value: "730", label: "730 days (2 years max)" },
];

interface FarmFormData {
  selectedToken: TokenMeta | null;
  rewardToken: TokenMeta;
  rewardAmount: string;
  duration: string;
}

export const CreateFarm = () => {
  const { t } = useTranslation();

  const publicClient = usePublicClient({
    chainId: mainnet.id,
  });
  const { writeContractAsync } = useWriteContract();

  const { tokens, isEthBalanceFetching } = useAllCoins();

  const [formData, setFormData] = useState<FarmFormData>({
    selectedToken: null,
    rewardToken:
      tokens?.find((t) => t.symbol !== "ETH" && t.id !== null) || ETH_TOKEN,
    rewardAmount: "",
    duration: "7",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<
    "idle" | "pending" | "confirming" | "success" | "error"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);

  if (!tokens || tokens.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        {t("common.loading_tokens")}
      </div>
    );
  }

  const poolTokens = useMemo(
    () => tokens?.filter((token) => token.liquidity && token.liquidity > 0n),
    [tokens],
  );

  // Filter reward tokens to exclude ETH (not supported by zChef)
  const rewardTokens = useMemo(
    () =>
      tokens?.filter((token) => token.symbol !== "ETH" && token.id !== null),
    [tokens],
  );

  const maxRewardAmount = formData.rewardToken.balance
    ? formData.rewardToken.decimals !== undefined &&
      formData.rewardToken.decimals !== 18
      ? (
          Number(formData.rewardToken.balance) /
          10 ** formData.rewardToken.decimals
        ).toString()
      : formatEther(BigInt(formData.rewardToken.balance))
    : "0";

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
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
          newErrors.rewardAmount =
            "Reward amount too large - precision overflow";
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
          const rewardAmountBigInt = parseUnits(
            formData.rewardAmount,
            decimals,
          );
          const durationSeconds = BigInt(durationDays * 24 * 60 * 60);
          const ACC_PRECISION = BigInt(1e12);
          const rate = (rewardAmountBigInt * ACC_PRECISION) / durationSeconds;
          if (rate > 2n ** 128n - 1n) {
            newErrors.rewardAmount =
              "Calculated reward rate too large - reduce amount or increase duration";
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
            await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });
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
            await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });
          }
        }
      } else {
        // For external ERC20 tokens, would need standard ERC20 approval
        // ETH is not supported as reward token by zChef
        console.log(
          "ERC20 approval would be implemented here for external tokens",
        );
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
            formData.selectedToken.token1 ||
              "0x0000000000000000000000000000000000000000",
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
        args: [
          lpToken,
          lpId,
          rewardTokenAddress,
          rewardId,
          rewardAmount,
          durationSeconds,
          uniqueBytes,
        ],
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
            rewardToken:
              tokens.find((t) => t.symbol !== "ETH" && t.id !== null) ||
              ETH_TOKEN,
            rewardAmount: "",
            duration: "7",
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

  return (
    <div className="max-w-lg mx-auto space-y-6 sm:space-y-8 px-3 sm:px-0">
      <div className="bg-gradient-to-br from-background/80 to-background/60 border border-primary/30 rounded-xl p-6 backdrop-blur-sm shadow-xl">
        <div className="text-center mb-6">
          <h3 className="font-bold text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            {t("common.create_new_farm")}
          </h3>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent mt-4"></div>
        </div>
        {/* LP Token Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-bold uppercase tracking-wider text-primary">
            {t("common.select_token_with_lp_pool")}
          </label>
          <div className="bg-background/50 border border-primary/20 rounded-lg p-3">
            <TokenSelector
              selectedToken={formData.selectedToken || ETH_TOKEN}
              tokens={poolTokens}
              onSelect={(token) =>
                setFormData((prev) => ({
                  ...prev,
                  selectedToken: token,
                }))
              }
              isEthBalanceFetching={isEthBalanceFetching}
            />
          </div>
          {errors.selectedToken && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
              <p className="text-sm text-red-400 font-mono">
                {errors.selectedToken}
              </p>
            </div>
          )}
          {formData.selectedToken && (
            <div className="bg-primary/10 border border-primary/20 rounded p-3">
              <div className="text-xs font-mono space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pool ID:</span>
                  <span className="text-primary font-bold">
                    {(
                      formData.selectedToken.poolId || formData.selectedToken.id
                    )?.toString() || "N/A"}
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
          <label className="block text-sm font-bold uppercase tracking-wider text-primary">
            {t("common.reward_token")}
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
              <p className="text-sm text-red-400 font-mono">
                {errors.rewardToken}
              </p>
            </div>
          )}
        </div>

        {/* Reward Amount */}
        <div className="space-y-3">
          <label className="block text-sm font-bold uppercase tracking-wider text-primary">
            {t("common.reward_amount")}
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              name="rewardAmount"
              value={formData.rewardAmount}
              onChange={handleInputChange}
              placeholder="60000"
              className="flex-1 bg-background/50 border-primary/20 focus:border-primary/50"
              step="0.000001"
              min="0"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  rewardAmount: maxRewardAmount,
                }))
              }
              disabled={parseFloat(maxRewardAmount) === 0}
              className="font-bold tracking-wide border-primary/30 hover:border-primary hover:bg-primary/20"
            >
              MAX
            </Button>
          </div>
          <div className="space-y-2">
            <div className="bg-muted/20 border border-muted/30 rounded p-3">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">Balance:</span>
                <span className="text-primary font-bold">
                  {parseFloat(maxRewardAmount).toFixed(6)}{" "}
                  {formData.rewardToken.symbol}
                </span>
              </div>
            </div>
            {formData.rewardAmount &&
              formData.duration &&
              parseFloat(formData.rewardAmount) > 0 && (
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/30 rounded-lg p-4">
                  <p className="font-bold text-primary mb-3 text-sm">
                    {t("common.emission_preview")}
                  </p>
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
                        {(
                          parseFloat(formData.rewardAmount) /
                          parseInt(formData.duration)
                        ).toFixed(6)}{" "}
                        {formData.rewardToken.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span className="text-muted-foreground">
                        Total ({formData.duration}d):
                      </span>
                      <span className="text-primary">
                        {parseFloat(formData.rewardAmount).toFixed(6)}{" "}
                        {formData.rewardToken.symbol}
                      </span>
                    </div>
                  </div>
                </div>
              )}
          </div>
          {errors.rewardAmount && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
              <p className="text-sm text-red-400 font-mono">
                {errors.rewardAmount}
              </p>
            </div>
          )}
        </div>

        {/* Duration Selection */}
        <div className="space-y-3">
          <label className="block text-sm font-bold uppercase tracking-wider text-primary">
            {t("common.duration")}
          </label>
          <select
            name="duration"
            value={formData.duration}
            onChange={handleInputChange}
            className="w-full px-4 py-3 border-2 border-primary/20 bg-background/50 text-foreground text-sm focus:outline-none focus:border-primary/50 rounded-lg backdrop-blur-sm"
          >
            {DURATION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors.duration && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
              <p className="text-sm text-red-400 font-mono">
                {errors.duration}
              </p>
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
              className="w-full font-bold tracking-wide hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary/80 to-primary/60 hover:from-primary hover:to-primary/80"
              variant="outline"
            >
              {isSubmitting
                ? t("common.approving")
                : `${t("common.approve")} ${formData.rewardToken.symbol}`}
            </Button>
          ) : formData.rewardToken.symbol !== "ETH" ? (
            <Button
              disabled={true}
              className="w-full font-bold tracking-wide opacity-50"
              variant="outline"
            >
              {t("common.external_erc20_not_supported")}
            </Button>
          ) : null}

          {/* Create Farm Button */}
          <Button
            onClick={handleCreateFarm}
            disabled={isSubmitting}
            className="w-full font-bold tracking-wide text-lg py-4 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg"
          >
            {isSubmitting
              ? t("common.creating_farm")
              : t("common.create_farm")}
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
                    <span className="font-bold text-primary">
                      {t("common.pending")}
                    </span>
                  </>
                )}
                {txStatus === "confirming" && (
                  <>
                    <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                    <span className="font-bold text-yellow-500">
                      {t("common.confirming")}
                    </span>
                  </>
                )}
                {txStatus === "success" && (
                  <>
                    <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                    <span className="font-bold text-green-500">
                      {t("common.success")}
                    </span>
                  </>
                )}
                {txStatus === "error" && (
                  <>
                    <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                    <span className="font-bold text-red-500">
                      {t("common.error")}
                    </span>
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
                  <p className="text-sm text-red-400 font-mono break-words">
                    {txError}
                  </p>
                </div>
              )}

              {txStatus === "success" && (
                <div className="text-center">
                  <p className="text-sm text-green-400 font-mono">
                    Farm created successfully! Check the Browse tab to see your
                    new farm.
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
  );
};
