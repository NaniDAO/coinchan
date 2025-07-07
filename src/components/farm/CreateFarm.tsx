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

// Duration options will be generated using translations

interface FarmFormData {
  selectedToken: TokenMeta | null;
  rewardToken: TokenMeta;
  rewardAmount: string;
  duration: string;
  customDuration: string;
  customDurationUnit: "minutes" | "hours" | "days";
  useCustomDuration: boolean;
}

export const CreateFarm = () => {
  const { t } = useTranslation();

  const DURATION_OPTIONS = [
    { value: "7", label: t("common.duration_7_days") },
    { value: "14", label: t("common.duration_14_days") },
    { value: "30", label: t("common.duration_30_days") },
    { value: "90", label: t("common.duration_90_days") },
    { value: "180", label: t("common.duration_180_days") },
    { value: "365", label: t("common.duration_365_days") },
    { value: "730", label: t("common.duration_730_days") },
  ];

  const publicClient = usePublicClient({
    chainId: mainnet.id,
  });
  const { writeContractAsync } = useWriteContract();

  const { tokens, isEthBalanceFetching } = useAllCoins();

  const [formData, setFormData] = useState<FarmFormData>({
    selectedToken: null,
    rewardToken:
      tokens?.find((t) => t.symbol !== "ETH") || ETH_TOKEN,
    rewardAmount: "",
    duration: "7",
    customDuration: "",
    customDurationUnit: "days",
    useCustomDuration: false,
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
    () => tokens?.filter((token) => 
      token.poolId && 
      token.poolId > 0n && 
      token.reserve0 && 
      token.reserve0 > 0n
    ),
    [tokens],
  );

  // Filter reward tokens to exclude ETH (not supported by zChef)
  const rewardTokens = useMemo(
    () =>
      tokens?.filter((token) => token.symbol !== "ETH"),
    [tokens],
  );

  // Helper function to convert custom duration to days
  const convertCustomDurationToDays = (duration: string, unit: "minutes" | "hours" | "days"): number => {
    const value = parseFloat(duration);
    if (isNaN(value) || value <= 0) return 0;
    
    switch (unit) {
      case "minutes":
        return value / (24 * 60); // Convert minutes to days
      case "hours":
        return value / 24; // Convert hours to days
      case "days":
        return value; // Already in days
      default:
        return value;
    }
  };

  const maxRewardAmount = formData.rewardToken.balance && formData.rewardToken.balance > 0n
    ? formData.rewardToken.decimals !== undefined &&
      formData.rewardToken.decimals !== 18
      ? formData.rewardToken.decimals > 0
        ? (
            Number(formData.rewardToken.balance) /
            10 ** formData.rewardToken.decimals
          ).toString()
        : "0"
      : formatEther(BigInt(formData.rewardToken.balance))
    : "0";

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name] || errors.duration) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        delete newErrors.duration;
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
      newErrors.selectedToken = t("common.please_select_token_with_lp_pool");
    } else {
      const poolId = formData.selectedToken.poolId;
      const reserve0 = formData.selectedToken.reserve0;

      if (!poolId || poolId === 0n) {
        newErrors.selectedToken = t("common.selected_token_no_valid_pool");
      }
      if (!reserve0 || reserve0 === 0n) {
        newErrors.selectedToken = t("common.selected_token_no_liquidity");
      }
    }

    // Validate reward token (ETH not supported by zChef)
    if (!formData.rewardToken.id) {
      if (formData.rewardToken.symbol === "ETH") {
        newErrors.rewardToken = t("common.eth_not_supported_reward");
      } else {
        newErrors.rewardToken = t("common.please_select_reward_token");
      }
    }

    // Validate reward amount
    if (!formData.rewardAmount || parseFloat(formData.rewardAmount) <= 0) {
      newErrors.rewardAmount = t("common.please_enter_valid_reward_amount");
    } else {
      // Check user balance
      try {
        const decimals = formData.rewardToken.decimals || 18;
        const rewardAmountBigInt = parseUnits(formData.rewardAmount, decimals);
        const userBalance = formData.rewardToken.balance || 0n;
        if (rewardAmountBigInt > userBalance) {
          newErrors.rewardAmount = t("common.insufficient_balance");
        }

        // Check for precision overflow (zChef requirement)
        const ACC_PRECISION = BigInt(1e12);
        if (rewardAmountBigInt > (2n ** 256n - 1n) / ACC_PRECISION) {
          newErrors.rewardAmount = t("common.reward_amount_too_large");
        }
      } catch (error) {
        newErrors.rewardAmount = t("common.invalid_reward_amount_format");
      }
    }

    // Validate duration
    const durationValue = formData.useCustomDuration ? formData.customDuration : formData.duration;
    if (!durationValue) {
      newErrors.duration = formData.useCustomDuration ? t("common.please_enter_custom_duration") : t("common.please_select_duration");
    } else {
      let durationDays: number;
      if (formData.useCustomDuration) {
        durationDays = convertCustomDurationToDays(durationValue, formData.customDurationUnit);
      } else {
        durationDays = parseInt(durationValue);
      }
      
      if (isNaN(durationDays)) {
        newErrors.duration = t("common.duration_must_be_valid_number");
      } else if (durationDays > 730) {
        newErrors.duration = t("common.duration_cannot_exceed_730");
      } else if (durationDays <= 0) {
        newErrors.duration = t("common.duration_must_be_positive");
      } else if (formData.useCustomDuration && durationDays < (1 / (24 * 60))) {
        // Minimum 1 minute
        newErrors.duration = t("common.duration_minimum_one_minute");
      } else {
        // Check rate overflow (zChef requirement)
        if (formData.rewardAmount && durationDays > 0) {
          try {
            const decimals = formData.rewardToken.decimals || 18;
            const rewardAmountBigInt = parseUnits(
              formData.rewardAmount,
              decimals,
            );
            const durationSeconds = BigInt(Math.floor(durationDays * 24 * 60 * 60));
            const ACC_PRECISION = BigInt(1e12);
            const rate = (rewardAmountBigInt * ACC_PRECISION) / durationSeconds;
            if (rate > 2n ** 128n - 1n) {
              newErrors.rewardAmount = t("common.calculated_rate_too_large");
            }
          } catch (error) {
            // Skip overflow check if calculation fails
          }
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

      // Check if approval is needed for reward token
      const rewardTokenId = formData.rewardToken.id;
      if (rewardTokenId) {
        setTxStatus("pending");
        // For ERC6909 tokens (both ZAMM and Cookbook coins), use setOperator
        if (rewardTokenId >= 1000000n) {
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
      }

      // Parse reward amount with proper decimals
      const decimals = formData.rewardToken.decimals || 18;
      const rewardAmount = parseUnits(formData.rewardAmount, decimals);

      // Re-validate that selected token still has a valid pool (race condition check)
      if (!formData.selectedToken?.poolId || formData.selectedToken.poolId === 0n) {
        throw new Error("Selected token no longer has a valid liquidity pool");
      }
      if (!formData.selectedToken?.reserve0 || formData.selectedToken.reserve0 === 0n) {
        throw new Error("Selected token pool no longer has liquidity");
      }

      // Validate duration and convert to seconds (uint64 safe)
      const durationValue = formData.useCustomDuration ? formData.customDuration : formData.duration;
      let durationDays: number;
      if (formData.useCustomDuration) {
        durationDays = convertCustomDurationToDays(durationValue, formData.customDurationUnit);
      } else {
        durationDays = parseInt(durationValue);
      }
      const durationInSeconds = Math.floor(durationDays * 24 * 60 * 60);
      if (durationInSeconds > 2 ** 63 - 1) { // uint64 max (signed safe)
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
      const rewardId = formData.rewardToken.id;

      if (!rewardId) {
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
              tokens.find((t) => t.symbol !== "ETH") ||
              ETH_TOKEN,
            rewardAmount: "",
            duration: "7",
            customDuration: "",
            customDurationUnit: "days",
            useCustomDuration: false,
          });
          setTxStatus("idle");
          setTxHash(null);
        }, 3000);
      }
    } catch (error: any) {
      console.error("Farm creation failed:", error);
      let errorMessage = t("common.farm_creation_failed");

      // Handle specific zChef contract errors
      if (error.message?.includes("ZeroAmount")) {
        errorMessage = t("common.amount_cannot_be_zero");
      } else if (error.message?.includes("InvalidDuration")) {
        errorMessage = t("common.invalid_duration_specified");
      } else if (error.message?.includes("Exists")) {
        errorMessage = t("common.farm_already_exists");
      } else if (error.message?.includes("PrecisionOverflow")) {
        errorMessage = t("common.precision_overflow");
      } else if (error.message?.includes("Overflow")) {
        errorMessage = t("common.calculated_rate_overflow");
      } else if (error.message?.includes("TransferFromFailed")) {
        errorMessage = t("common.transfer_failed");
      } else if (error.message?.includes("User rejected")) {
        errorMessage = t("common.transaction_rejected");
      } else if (error.message?.includes("insufficient funds")) {
        errorMessage = t("common.insufficient_funds_tx");
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
      <div className="bg-gradient-to-br from-background/80 to-background/60 border border-primary/30 rounded-xl p-6 sm:p-8 backdrop-blur-sm shadow-xl">
        <div className="text-center mb-6">
          <h3 className="font-mono font-bold text-lg uppercase tracking-wider bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            [{t("common.create_new_farm")}]
          </h3>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent mt-4"></div>
        </div>
        {/* LP Token Selection */}
        <div className="space-y-4 mb-10">
          <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
            {t("common.select_lp_pool")}
          </label>
          <div className="bg-background/50 border border-primary/20 rounded-lg p-3">
            {poolTokens.length > 0 ? (
              <TokenSelector
                selectedToken={formData.selectedToken || poolTokens[0] || tokens[0]}
                tokens={poolTokens}
                onSelect={(token) =>
                  setFormData((prev) => ({
                    ...prev,
                    selectedToken: token,
                  }))
                }
                isEthBalanceFetching={isEthBalanceFetching}
              />
            ) : (
              <div className="text-center py-4 text-muted-foreground text-sm font-mono">
                <div className="mb-2">🏊‍♂️ {t("common.no_lp_pools_available")}</div>
                <div className="text-xs">
                  {t("common.create_lp_pool_first")}
                </div>
              </div>
            )}
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
                <div className="space-y-1">
                  <span className="text-muted-foreground text-xs">{t("common.pool_id")}:</span>
                  <div className="text-xs text-muted-foreground/70 font-mono break-all">
                    {(
                      formData.selectedToken.poolId || formData.selectedToken.id
                    )?.toString() || "N/A"}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("common.pair")}:</span>
                  <span className="text-primary font-bold">
                    ETH / {formData.selectedToken.symbol}
                  </span>
                </div>
                {formData.selectedToken.reserve0 && formData.selectedToken.reserve0 > 0n ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("common.liquidity_label")}:</span>
                    <span className="text-primary font-bold">
                      {formatEther(formData.selectedToken.reserve0)} ETH
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Reward Token Selection */}
        <div className="space-y-4 mb-10">
          <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
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
        <div className="space-y-4 mb-10">
          <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
            {t("common.reward_amount")}
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
              size="default"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  rewardAmount: maxRewardAmount,
                }))
              }
              disabled={parseFloat(maxRewardAmount) === 0}
              className="font-mono font-bold tracking-wide border-primary/30 hover:border-primary hover:bg-primary/20 min-h-[44px] px-4"
            >
              {t("common.max")}
            </Button>
          </div>
          <div className="space-y-2">
            <div className="bg-muted/20 border border-muted/30 rounded p-3">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">{t("common.balance_label")}:</span>
                <span className="text-primary font-bold">
                  {parseFloat(maxRewardAmount).toFixed(6)}{" "}
                  {formData.rewardToken.symbol}
                </span>
              </div>
            </div>
            {(() => {
              const durationValue = formData.useCustomDuration ? formData.customDuration : formData.duration;
              let durationDays: number;
              if (formData.useCustomDuration) {
                durationDays = convertCustomDurationToDays(durationValue, formData.customDurationUnit);
              } else {
                durationDays = parseInt(durationValue);
              }
              return formData.rewardAmount &&
                durationValue &&
                parseFloat(formData.rewardAmount) > 0 &&
                !isNaN(durationDays) && 
                durationDays > 0 && (
                  <div className="border border-primary/20 rounded-lg p-4 bg-background/30">
                    <h4 className="font-mono font-bold text-primary mb-4 text-base tracking-wider">
                      [{t("common.emission_preview").toUpperCase()}]
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center py-2 border-b border-primary/10">
                        <span className="font-mono text-sm text-muted-foreground">{t("common.per_second")}:</span>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {(
                            parseFloat(formData.rewardAmount) /
                            (durationDays * 24 * 60 * 60)
                          ).toFixed(8)}{" "}
                          <span className="text-primary">{formData.rewardToken.symbol}</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-primary/10">
                        <span className="font-mono text-sm text-muted-foreground">{t("common.per_day")}:</span>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {(
                            parseFloat(formData.rewardAmount) /
                            durationDays
                          ).toFixed(6)}{" "}
                          <span className="text-primary">{formData.rewardToken.symbol}</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 bg-primary/5 px-3 rounded">
                        <span className="font-mono text-sm font-bold text-primary">
                          {formData.useCustomDuration ? (
                            `${t("common.total_custom", { 
                              amount: formData.customDuration, 
                              unit: t(`common.${formData.customDurationUnit}`) 
                            })}:`
                          ) : (
                            `${t("common.total_days", { days: durationDays })}:`
                          )}
                        </span>
                        <span className="font-mono text-sm font-bold text-primary">
                          {parseFloat(formData.rewardAmount).toFixed(6)}{" "}
                          {formData.rewardToken.symbol}
                        </span>
                      </div>
                    </div>
                  </div>
                );
            })()}
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
        <div className="space-y-4 mb-10">
          <label className="block text-sm font-mono font-bold uppercase tracking-wider text-primary">
            {t("common.duration")}
          </label>
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 border border-primary/30 rounded-lg bg-background/30 hover:bg-background/50 transition-colors cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, useCustomDuration: false }))}>
              <div className={`w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center ${!formData.useCustomDuration ? 'bg-primary' : 'bg-transparent'}`}>
                {!formData.useCustomDuration && <div className="w-2 h-2 rounded-full bg-primary-foreground"></div>}
              </div>
              <label htmlFor="preset-duration" className="text-sm font-mono font-bold cursor-pointer text-primary">{t("common.preset_durations")}</label>
            </div>
            {!formData.useCustomDuration && (
              <select
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
                className="w-full px-4 py-3 border-2 border-primary/20 bg-background/50 text-foreground font-mono text-sm focus:outline-none focus:border-primary/50 rounded-lg backdrop-blur-sm min-h-[44px] mt-3"
              >
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-3 p-4 border border-primary/30 rounded-lg bg-background/30 hover:bg-background/50 transition-colors cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, useCustomDuration: true }))}>
              <div className={`w-4 h-4 rounded-full border-2 border-primary flex items-center justify-center ${formData.useCustomDuration ? 'bg-primary' : 'bg-transparent'}`}>
                {formData.useCustomDuration && <div className="w-2 h-2 rounded-full bg-primary-foreground"></div>}
              </div>
              <label htmlFor="custom-duration" className="text-sm font-mono font-bold cursor-pointer text-primary">{t("common.custom_duration")}</label>
            </div>
            {formData.useCustomDuration && (
              <div className="flex items-center gap-3 mt-3">
                <Input
                  type="number"
                  name="customDuration"
                  value={formData.customDuration}
                  onChange={handleInputChange}
                  placeholder={t("common.enter_amount")}
                  className="flex-1 font-mono bg-background/50 border-primary/20 focus:border-primary/50 min-h-[44px]"
                  min="1"
                  step="0.1"
                />
                <select
                  value={formData.customDurationUnit}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    customDurationUnit: e.target.value as "minutes" | "hours" | "days" 
                  }))}
                  className="px-4 py-3 border-2 border-primary/20 bg-background/50 text-foreground font-mono text-sm focus:outline-none focus:border-primary/50 rounded-lg backdrop-blur-sm min-w-[90px] min-h-[44px]"
                >
                  <option value="minutes">{t("common.minutes")}</option>
                  <option value="hours">{t("common.hours")}</option>
                  <option value="days">{t("common.days")}</option>
                </select>
              </div>
            )}
          </div>
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

          {/* Create Farm Button */}
          <Button
            onClick={handleCreateFarm}
            disabled={isSubmitting}
            className="w-full font-mono font-bold tracking-wide text-lg py-6 hover:scale-105 transition-all duration-200 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg min-h-[56px] border border-primary/30"
          >
            {isSubmitting
              ? `[${t("common.creating_farm")}...]`
              : `[${t("common.create_farm")}]`}
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
                    <span className="font-mono font-bold text-primary">
                      [PENDING]
                    </span>
                  </>
                )}
                {txStatus === "confirming" && (
                  <>
                    <div className="animate-pulse h-4 w-4 bg-yellow-500 rounded-full"></div>
                    <span className="font-mono font-bold text-yellow-500">
                      [CONFIRMING]
                    </span>
                  </>
                )}
                {txStatus === "success" && (
                  <>
                    <div className="h-4 w-4 bg-green-500 rounded-full"></div>
                    <span className="font-mono font-bold text-green-500">
                      [SUCCESS]
                    </span>
                  </>
                )}
                {txStatus === "error" && (
                  <>
                    <div className="h-4 w-4 bg-red-500 rounded-full"></div>
                    <span className="font-mono font-bold text-red-500">
                      [ERROR]
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
                    {t("common.farm_created_successfully")}
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
