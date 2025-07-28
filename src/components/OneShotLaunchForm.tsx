import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { type ChangeEvent, useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { z } from "zod";
import { ZCurveBondingChart } from "@/components/ZCurveBondingChart";
import "@/components/ui/animations.css";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ImageInput } from "@/components/ui/image-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { toast } from "sonner";

import { formatEther, parseEther } from "viem";
import { packQuadCap, UNIT_SCALE } from "@/lib/zCurveHelpers";

import { Link } from "@tanstack/react-router";
import { AlertCircle, Info, Rocket, CheckCircle2, Sparkles } from "lucide-react";

// Quantize values to unit scale to match contract requirements
const quantizeToUnitScale = (value: bigint): bigint => {
  return (value / BigInt(UNIT_SCALE)) * BigInt(UNIT_SCALE);
};

// Hardcoded parameters for zCurve launch
const ONE_SHOT_PARAMS = {
  creatorSupply: BigInt(0), // No creator supply
  creatorUnlock: 0, // No unlock period
  saleCap: quantizeToUnitScale(parseEther("800000000")), // 800M coins for sale (quantized)
  lpSupply: quantizeToUnitScale(parseEther("200000000")), // 200M coins for liquidity (quantized)
  ethTarget: parseEther("0.01"), // 0.01 ETH target for testing (wei values don't need quantization)
  divisor: 2193868799999997460800000000001533333333333334n, // Hardcoded divisor for 552M quadCap @ 0.01 ETH target
  feeOrHook: 30, // 0.3% AMM fee in bps
  quadCap: quantizeToUnitScale(parseEther("552000000")), // 552M (69% of sale supply) for quadratic phase (quantized)
  duration: 60 * 60 * 24 * 14, // 2 weeks in seconds
};

// Validation schema with better constraints
const oneShotFormSchema = z.object({
  metadataName: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9\s\-_.]+$/, "Name can only contain letters, numbers, spaces, hyphens, underscores and dots"),
  metadataSymbol: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9]+$/, "Symbol must be uppercase letters and numbers only")
    .transform((val) => val.toUpperCase()),
  metadataDescription: z.string().max(500).optional(),
});

type OneShotFormData = z.infer<typeof oneShotFormSchema>;

// Format large numbers with M/B suffixes
const formatTokenAmount = (amount: bigint): string => {
  const num = Number(formatEther(amount));
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
  return num.toLocaleString();
};

// Format ETH amounts
const formatEthAmount = (amount: bigint): string => {
  return Number(formatEther(amount)).toFixed(2);
};

export function OneShotLaunchForm() {
  const { t } = useTranslation();
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const {
    writeContract,
    data: hash,
    isPending,
    error,
  } = useWriteContract();

  // Wait for transaction
  const {
    isLoading: txLoading,
    isSuccess: txSuccess,
  } = useWaitForTransactionReceipt({ hash });

  // Store launched coin ID
  const [launchId, setLaunchId] = useState<bigint | null>(null);

  // Form state
  const [formData, setFormData] = useState<OneShotFormData>({
    metadataName: "",
    metadataSymbol: "",
    metadataDescription: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Keep track of the image buffer and upload state
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Computed values for display
  const displayValues = useMemo(() => {
    const saleCap = formatTokenAmount(ONE_SHOT_PARAMS.saleCap);
    const lpSupply = formatTokenAmount(ONE_SHOT_PARAMS.lpSupply);
    const quadCap = formatTokenAmount(ONE_SHOT_PARAMS.quadCap);
    const ethTarget = formatEthAmount(ONE_SHOT_PARAMS.ethTarget);
    const totalSupply = formatTokenAmount(ONE_SHOT_PARAMS.saleCap + ONE_SHOT_PARAMS.lpSupply);
    const salePercent = Math.round(
      (Number(ONE_SHOT_PARAMS.saleCap) / Number(ONE_SHOT_PARAMS.saleCap + ONE_SHOT_PARAMS.lpSupply)) * 100,
    );
    const lpPercent = Math.round(
      (Number(ONE_SHOT_PARAMS.lpSupply) / Number(ONE_SHOT_PARAMS.saleCap + ONE_SHOT_PARAMS.lpSupply)) * 100,
    );
    const days = ONE_SHOT_PARAMS.duration / (60 * 60 * 24);
    const fee = ONE_SHOT_PARAMS.feeOrHook / 100;

    return {
      saleCap,
      lpSupply,
      quadCap,
      ethTarget,
      totalSupply,
      salePercent,
      lpPercent,
      days,
      fee,
    };
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Handle symbol uppercase transformation
    const processedValue = name === "metadataSymbol" ? value.toUpperCase() : value;
    
    setFormData((prev) => ({ ...prev, [name]: processedValue }));

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  }, [errors]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    
    // Validate single field on blur
    try {
      const fieldSchema = oneShotFormSchema.shape[name as keyof typeof oneShotFormSchema.shape];
      if (fieldSchema) {
        fieldSchema.parse(formData[name as keyof OneShotFormData]);
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldError = error.errors[0];
        if (fieldError) {
          setErrors((prev) => ({ ...prev, [name]: getErrorMessage(name, fieldError) }));
        }
      }
    }
  }, [formData]);

  const getErrorMessage = (field: string, error: z.ZodIssue): string => {
    if (error.code === "too_small" && error.minimum === 1) {
      if (field === "metadataName") {
        return t("create.name_required", "Name is required");
      } else if (field === "metadataSymbol") {
        return t("create.symbol_required", "Symbol is required");
      }
    } else if (error.code === "too_big") {
      if (field === "metadataName") {
        return t("create.name_max_length", "Name must be 100 characters or less");
      } else if (field === "metadataSymbol") {
        return t("create.symbol_max_length", "Symbol must be 50 characters or less");
      } else if (field === "metadataDescription") {
        return t("create.description_max_length", "Description must be 500 characters or less");
      }
    } else if (error.code === "invalid_string" && error.validation === "regex") {
      if (field === "metadataName") {
        return t("create.name_invalid_characters", "Name can only contain letters, numbers, spaces, hyphens, underscores and dots");
      } else if (field === "metadataSymbol") {
        return t("create.symbol_invalid_characters", "Symbol must be uppercase letters and numbers only");
      }
    }
    return error.message;
  };

  const handleImageFileChange = async (file: File | File[] | undefined) => {
    if (file && !Array.isArray(file)) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t("create.image_too_large", "Image must be less than 5MB"));
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error(t("create.invalid_image_type", "Please upload an image file"));
        return;
      }

      const buffer = await file.arrayBuffer();
      setImageBuffer(buffer);
    } else {
      setImageBuffer(null);
    }
  };

  const validateForm = (): boolean => {
    try {
      oneShotFormSchema.parse(formData);
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            const field = err.path[0].toString();
            newErrors[field] = getErrorMessage(field, err);
          }
        });
        setErrors(newErrors);
        
        // Mark all fields as touched to show errors
        setTouched({
          metadataName: true,
          metadataSymbol: true,
          metadataDescription: true,
        });
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error(t("common.error_fix_form", "Please fix the form errors"));
      return;
    }

    if (!account) {
      toast.error(t("common.error_connect_wallet", "Please connect your wallet"));
      return;
    }

    try {
      setIsUploading(true);

      // Create metadata
      const metadata: Record<string, unknown> = {
        name: formData.metadataName.trim(),
        symbol: formData.metadataSymbol.trim(),
        decimals: 18,
      };

      if (formData.metadataDescription?.trim()) {
        metadata.description = formData.metadataDescription.trim();
      }

      // Upload image first if provided
      if (imageBuffer) {
        toast.info(t("create.uploading_image", "Uploading image..."));
        const imageUri = await pinImageToPinata(imageBuffer, `${formData.metadataName}-logo`, {
          keyvalues: {
            coinName: formData.metadataName,
            coinSymbol: formData.metadataSymbol,
            type: "coin-logo",
          },
        });
        metadata.image = imageUri;
      }

      // Upload metadata to Pinata
      toast.info(t("create.uploading_metadata", "Uploading metadata..."));
      const metadataUri = await pinJsonToPinata(metadata);

      setIsUploading(false);
      toast.info(t("create.starting_blockchain_transaction", "Starting blockchain transaction..."));

      // Pack quadCap with lpUnlock (0 for public sale)
      const quadCapWithFlags = packQuadCap(ONE_SHOT_PARAMS.quadCap, BigInt(0));

      // Validate divisor
      if (!ONE_SHOT_PARAMS.divisor || ONE_SHOT_PARAMS.divisor === 0n) {
        toast.error(t("create.invalid_configuration", "Invalid configuration: divisor calculation failed"));
        setIsUploading(false);
        return;
      }

      // Prepare contract arguments
      const contractArgs = [
        ONE_SHOT_PARAMS.creatorSupply, // creatorSupply: 0
        BigInt(ONE_SHOT_PARAMS.creatorUnlock), // creatorUnlock: 0
        ONE_SHOT_PARAMS.saleCap, // saleCap: 800M tokens (as uint96)
        ONE_SHOT_PARAMS.lpSupply, // lpSupply: 200M tokens (as uint96)
        ONE_SHOT_PARAMS.ethTarget, // ethTargetWei: 0.01 ETH (as uint128)
        ONE_SHOT_PARAMS.divisor, // divisor: hardcoded value
        BigInt(ONE_SHOT_PARAMS.feeOrHook), // feeOrHook: 30 (0.3% fee)
        quadCapWithFlags, // quadCapWithFlags: quadCap with no LP unlock
        BigInt(ONE_SHOT_PARAMS.duration), // duration: 2 weeks
        metadataUri, // uri: IPFS metadata URI
      ] as const;

      // Try to simulate first to get the coin ID
      if (publicClient) {
        try {
          // Simulate the transaction to get the predicted coin ID
          const { result } = await publicClient.simulateContract({
            account,
            address: zCurveAddress,
            abi: zCurveAbi,
            functionName: "launch",
            args: contractArgs,
          });

          // Set the predicted launch ID (first element of tuple)
          setLaunchId(result[0]);
        } catch (simError) {
          console.warn("Contract simulation failed, proceeding without coin ID prediction:", simError);
        }
      }

      // Call launch() with hardcoded zCurve parameters
      writeContract({
        address: zCurveAddress,
        abi: zCurveAbi,
        functionName: "launch",
        args: contractArgs,
      });

      toast.success(t("create.launch_success", "Oneshot launch initiated!"));
    } catch (error) {
      console.error("Launch error:", error);
      setIsUploading(false);

      // Handle wallet errors gracefully
      if (isUserRejectionError(error)) {
        toast.error(t("create.launch_cancelled", "Launch cancelled by user"));
      } else {
        const errorMessage = handleWalletError(error, { t });
        toast.error(errorMessage || t("create.launch_failed", "Failed to launch coin. Please try again."));
      }
    }
  };

  // Check if form is valid for submit button
  const isFormValid = useMemo(() => {
    try {
      oneShotFormSchema.parse(formData);
      return true;
    } catch {
      return false;
    }
  }, [formData]);


  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Token Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="metadataName" className="mb-2 flex items-center gap-1">
                {t("create.name", "Name")} <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="metadataName"
                  name="metadataName"
                  value={formData.metadataName}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder={t("create.enter_name", "Enter coin name")}
                  className={`transition-all duration-200 ${errors.metadataName && touched.metadataName ? "border-red-500 shake" : ""}`}
                  disabled={isPending || isUploading}
                  maxLength={100}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {formData.metadataName.length}/100
                </span>
              </div>
              {errors.metadataName && touched.metadataName && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.metadataName}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="metadataSymbol" className="mb-2 flex items-center gap-1">
                {t("create.symbol", "Symbol")} <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="metadataSymbol"
                  name="metadataSymbol"
                  value={formData.metadataSymbol}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder={t("create.enter_symbol", "Enter coin symbol")}
                  className={`transition-all duration-200 ${errors.metadataSymbol && touched.metadataSymbol ? "border-red-500 shake" : ""}`}
                  disabled={isPending || isUploading}
                  maxLength={50}
                  style={{ textTransform: "uppercase" }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  {formData.metadataSymbol.length}/50
                </span>
              </div>
              {errors.metadataSymbol && touched.metadataSymbol && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.metadataSymbol}
                </p>
              )}
              <p className="text-muted-foreground text-xs mt-1">
                {t("create.symbol_uppercase_hint", "Will be automatically converted to uppercase")}
              </p>
            </div>

            <div>
              <Label htmlFor="metadataDescription" className="mb-2">
                {t("create.description", "Description")}
                <span className="text-muted-foreground text-xs ml-2">
                  {t("common.optional", "optional")}
                </span>
              </Label>
              <Textarea
                id="metadataDescription"
                name="metadataDescription"
                value={formData.metadataDescription}
                onChange={handleInputChange}
                onBlur={handleBlur}
                placeholder={t("create.enter_description", "Describe your coin")}
                rows={3}
                disabled={isPending || isUploading}
                maxLength={500}
                className="resize-none"
              />
              <p className="text-muted-foreground text-xs mt-1 text-right">
                {formData.metadataDescription?.length || 0}/500
              </p>
            </div>

            <div>
              <Label className="mb-2">
                {t("create.image", "Image")}
                <span className="text-muted-foreground text-xs ml-2">
                  {t("common.optional", "optional")}
                </span>
              </Label>
              <ImageInput 
                onChange={handleImageFileChange} 
              />
              <p className="text-muted-foreground text-xs mt-1">
                {t("create.image_requirements", "Max 5MB, PNG/JPG/GIF supported")}
              </p>
            </div>
          </div>

          {/* Parameters Display with Landing Page Style */}
          <div className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200 p-3 sm:p-4 rounded-lg relative overflow-hidden group">
            {/* Animated gradient background */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="flex items-center gap-2 mb-2 sm:mb-3 relative z-10">
              <div
                className="w-3 h-3 rounded-full bg-primary shadow-sm animate-pulse"
                style={{ boxShadow: "0 0 8px var(--primary)" }}
              />
              <h3 className="font-bold text-foreground text-base sm:text-lg flex items-center gap-2">
                {t("create.instant_coin_sale", "zCurve Bonding Curve Launch")}
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              </h3>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:gap-3 text-xs sm:text-sm relative z-10">
              <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3 rounded-lg">
                <div className="font-bold text-foreground text-sm sm:text-base">
                  {t(
                    "create.oneshot_supply_breakdown",
                    "{{totalSupply}} Total Supply: {{saleCap}} bonding curve + {{lpSupply}} liquidity",
                    {
                      totalSupply: displayValues.totalSupply,
                      saleCap: displayValues.saleCap,
                      lpSupply: displayValues.lpSupply,
                    },
                  )}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  {t(
                    "create.oneshot_percentages",
                    "{{salePercent}}% public bonding curve • {{lpPercent}}% auto-liquidity",
                    {
                      salePercent: displayValues.salePercent,
                      lpPercent: displayValues.lpPercent,
                    },
                  )}
                </div>
              </div>
              <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3 rounded-lg">
                <div className="font-bold text-foreground text-sm sm:text-base">
                  {t("create.oneshot_sale_price", "Bonding Curve: Quadratic → Linear pricing")}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  {t(
                    "create.oneshot_sale_note",
                    "Target: {{target}} ETH • Quadratic until {{quadCap}} sold ({{quadPercent}}%) • {{days}} day deadline",
                    {
                      target: displayValues.ethTarget,
                      quadCap: displayValues.quadCap,
                      quadPercent: Math.round((Number(ONE_SHOT_PARAMS.quadCap) / Number(ONE_SHOT_PARAMS.saleCap)) * 100),
                      days: displayValues.days,
                    },
                  )}
                </div>
              </div>
              <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3 rounded-lg">
                <div className="font-bold text-foreground text-sm sm:text-base">
                  {t("create.oneshot_auto_liquidity", "Auto-Finalization: Creates AMM pool on success")}
                </div>
                <div className="text-muted-foreground text-xs mt-1">
                  {t(
                    "create.oneshot_instant_trading",
                    "{{lpSupply}} tokens + ETH raised → {{fee}}% fee AMM • Instant trading",
                    {
                      lpSupply: displayValues.lpSupply,
                      fee: displayValues.fee,
                    },
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bonding Curve Visualization */}
          <div className="border-2 border-border rounded-lg p-4 bg-background hover:shadow-md transition-all duration-200">
            <ZCurveBondingChart
              saleCap={ONE_SHOT_PARAMS.saleCap}
              divisor={ONE_SHOT_PARAMS.divisor}
              ethTarget={ONE_SHOT_PARAMS.ethTarget}
              quadCap={ONE_SHOT_PARAMS.quadCap}
              currentSold={BigInt(0)}
            />
          </div>

          {/* Info Alert */}
          {!account && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">
                {t("common.wallet_required", "Wallet Required")}
              </AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                {t("common.connect_wallet_to_continue", "Please connect your wallet to continue")}
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button with Landing Style */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              type="submit"
              disabled={isPending || !account || isUploading || !isFormValid}
              className="flex-1 min-h-[44px] font-bold border-2 hover:shadow-lg transition-all duration-200 relative"
              size="lg"
            >
              {isUploading ? (
                <>
                  <span className="animate-pulse">{t("common.uploading", "Uploading...")}</span>
                </>
              ) : isPending ? (
                <>
                  <span className="animate-pulse">{t("create.launching", "Launching...")}</span>
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  {t("common.launch", "Launch")}
                </>
              )}
            </Button>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t("common.error", "Error")}</AlertTitle>
              <AlertDescription className="break-words">{error.message}</AlertDescription>
            </Alert>
          )}

          {/* Transaction Success Display */}
          {hash && (
            <Alert className="border-2 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950 fade-in">
              <div className="space-y-4">
                {/* Header with icon and title */}
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {txLoading ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-4 border-green-600 border-t-transparent" />
                    ) : (
                      <div className="relative">
                        <CheckCircle2 className="h-8 w-8 text-green-600 pulse-success" />
                        <div className="absolute inset-0 h-8 w-8 bg-green-600 rounded-full animate-ping opacity-20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <AlertTitle className="text-green-800 dark:text-green-200 text-lg font-bold">
                      {txSuccess
                        ? t("create.transaction_confirmed", "Transaction Confirmed")
                        : t("create.transaction_submitted", "Transaction Submitted")}!
                    </AlertTitle>
                    <p className="text-green-700 dark:text-green-300 text-sm mt-1">
                      {txSuccess
                        ? t("create.launch_successful", "Your coin launch was successful!")
                        : t("create.launch_submitted", "Your oneshot launch has been submitted!")}
                    </p>
                  </div>
                </div>

                {/* Transaction Hash */}
                <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-3 border border-green-200 dark:border-green-800">
                  <p className="text-xs text-green-700 dark:text-green-300 mb-1">
                    {t("common.transaction_hash", "Transaction Hash")}
                  </p>
                  <p className="font-mono text-xs sm:text-sm text-green-800 dark:text-green-200 break-all">
                    {hash}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <a
                    href={`https://etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors duration-200 font-medium text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {t("common.view_on_etherscan", "View on Etherscan")}
                  </a>
                  
                  {launchId !== null && (
                    <Link
                      to="/c/$coinId"
                      params={{ coinId: launchId.toString() }}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors duration-200 font-medium text-sm"
                    >
                      <Rocket className="w-4 h-4" />
                      {t("create.view_coin_sale", "View Coin Sale")}
                    </Link>
                  )}
                  
                  <Link 
                    to="/explore" 
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-background hover:bg-muted border-2 border-border text-foreground rounded-lg transition-colors duration-200 font-medium text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    {t("create.view_all_coins", "View All Coins")}
                  </Link>
                </div>

                {/* Loading indicator for transaction confirmation */}
                {txLoading && (
                  <div className="flex items-center justify-center gap-2 text-sm text-green-700 dark:text-green-300">
                    <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                    {t("create.waiting_for_confirmation", "Waiting for blockchain confirmation...")}
                  </div>
                )}
              </div>
            </Alert>
          )}
        </form>

        {/* Back to Launch */}
        <div className="text-center mt-8 pb-4">
          <Link
            to="/launch"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t("navigation.back_to_advanced_launch", "Back to Advanced Launch")}
          </Link>
        </div>
      </div>
    </div>
  );
}