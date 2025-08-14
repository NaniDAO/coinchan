import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import React, { type ChangeEvent, useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, useWaitForTransactionReceipt, useWriteContract, useGasPrice } from "wagmi";
import { z } from "zod";
import { useETHPrice } from "@/hooks/use-eth-price";
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
import { useTheme } from "@/lib/theme";

import { formatEther, parseEther, decodeEventLog } from "viem";
import { packQuadCap, UNIT_SCALE } from "@/lib/zCurveHelpers";

import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, Info, Rocket, CheckCircle2, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

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
  ethTarget: parseEther("10"), // 10 ETH target (wei values don't need quantization)
  divisor: 2193868799999997460800000000001533333333334n, // Hardcoded divisor for 552M quadCap @ 10 ETH target
  feeOrHook: 30, // 0.3% AMM fee in bps
  quadCap: quantizeToUnitScale(parseEther("552000000")), // 552M (69% of sale supply) for quadratic phase (quantized)
  duration: 60 * 60 * 24 * 14, // 2 weeks in seconds
};

// Gas estimate for launching a zCurve
const ZCURVE_LAUNCH_GAS = 179603n;

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
  const { t, i18n, ready } = useTranslation();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { address: account } = useAccount();
  const { data: gasPrice } = useGasPrice();
  const { data: ethPrice } = useETHPrice();
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();

  // Filter out user rejection errors for display
  const error = useMemo(() => {
    if (!writeError) return null;
    if (isUserRejectionError(writeError)) return null;
    return writeError;
  }, [writeError]);

  // Wait for transaction and get receipt
  const { data: receipt, isLoading: txLoading, isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash });

  // Store launched coin ID
  const [launchId, setLaunchId] = useState<bigint | null>(null);

  // State for collapsible advanced details
  const [showAdvancedDetails, setShowAdvancedDetails] = useState<boolean>(false);

  // Extract coin ID from transaction receipt
  useEffect(() => {
    if (receipt) {
      // Parse logs to find the Launch event and extract coin ID
      try {
        const launchLog = receipt.logs.find((log) => {
          try {
            const decoded = decodeEventLog({
              abi: zCurveAbi,
              data: log.data,
              topics: log.topics,
            });
            return decoded.eventName === "Launch";
          } catch {
            return false;
          }
        });

        if (launchLog) {
          const decoded = decodeEventLog({
            abi: zCurveAbi,
            data: launchLog.data,
            topics: launchLog.topics,
          });
          // The Launch event has coinId as the second indexed parameter (after creator)
          // Structure: event Launch(address indexed creator, uint256 indexed coinId, ...)
          if (decoded.args) {
            // coinId is in the topics as it's indexed
            const coinIdTopic = launchLog.topics[2]; // topics[0] is event signature, [1] is creator, [2] is coinId
            if (coinIdTopic) {
              setLaunchId(BigInt(coinIdTopic));
            }
          }
        }
      } catch (error) {
        console.error("Failed to parse launch event:", error);
      }
    }
  }, [receipt]);

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

  // Redirect countdown state
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

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

  // Calculate gas estimates
  const gasEstimate = useMemo(() => {
    if (!gasPrice || !ethPrice) return null;

    const gasCostWei = ZCURVE_LAUNCH_GAS * gasPrice;
    const gasCostETH = Number(formatEther(gasCostWei));
    const gasCostUSD = gasCostETH * ethPrice.priceUSD;

    return {
      gas: ZCURVE_LAUNCH_GAS.toString(),
      eth: gasCostETH.toFixed(6),
      usd: gasCostUSD.toFixed(2),
      gwei: Number(formatEther(gasPrice * 10n ** 9n)).toFixed(2),
    };
  }, [gasPrice, ethPrice]);

  // Get the current language and header text
  const currentLang = i18n.language.split("-")[0];
  const headerText = useMemo(() => {
    if (!ready) return "";
    // Force Chinese text if language is Chinese
    if (currentLang === "zh") {
      return "公平发行代币。\n通过交易发现价格。\n然后在 zAMM 中提供流动性。";
    }
    return t("create.oneshot_header", "Fair launch a Coin.\nTrade to find its price.\nThen seed liquidity in zAMM.");
  }, [t, ready, currentLang]);

  // Helper to get translated text with Chinese fallback
  const getTranslated = useCallback(
    (key: string, defaultText: string, params?: any): string => {
      if (!ready) return defaultText;

      // Try to get the translation
      try {
        if (params) {
          // For parameterized translations, pass params correctly
          const result = t(key, { ...params });
          if (result && result !== key) {
            return String(result);
          }
        } else {
          // For simple translations
          const result = t(key);
          if (result && result !== key) {
            return String(result);
          }
        }
      } catch (e) {
        console.warn("Translation error for key:", key, e);
      }

      // Fallback to default text
      return defaultText;
    },
    [t, ready],
  );

  // Calculate form completion percentage
  const formCompletionPercentage = useMemo(() => {
    let completed = 0;
    const totalFields = 4; // name, symbol, description, image

    if (formData.metadataName.trim()) completed++;
    if (formData.metadataSymbol.trim()) completed++;
    if (formData.metadataDescription && formData.metadataDescription.trim()) completed++;
    if (imageBuffer) completed++;

    return (completed / totalFields) * 100;
  }, [formData, imageBuffer]);

  // Handle redirect after successful transaction
  useEffect(() => {
    if (txSuccess && launchId !== null) {
      // Start the countdown at 10 seconds
      setRedirectCountdown(10);

      const countdownInterval = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownInterval);
            // Navigate to the coin page
            navigate({ to: "/c/$coinId", params: { coinId: launchId.toString() } });
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      // Cleanup interval on unmount
      return () => clearInterval(countdownInterval);
    }
  }, [txSuccess, launchId, navigate]);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const { name, value } = e.target;

      // Handle symbol uppercase transformation
      const processedValue = name === "metadataSymbol" ? value.toUpperCase() : value;

      setFormData((prev) => ({ ...prev, [name]: processedValue }));

      // Clear error for this field when user starts typing
      if (errors[name]) {
        setErrors((prev) => ({ ...prev, [name]: "" }));
      }
    },
    [errors],
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
    },
    [formData],
  );

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
        return t(
          "create.name_invalid_characters",
          "Name can only contain letters, numbers, spaces, hyphens, underscores and dots",
        );
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

      // Show single uploading toast
      toast.info(t("create.preparing_launch", "Preparing your coin launch..."));

      // Create metadata
      const metadata: Record<string, unknown> = {
        name: formData.metadataName.trim(),
        symbol: formData.metadataSymbol.trim(),
        decimals: 18,
      };

      if (formData.metadataDescription?.trim()) {
        metadata.description = formData.metadataDescription.trim();
      }

      // Prepare upload promises
      const uploadPromises: Promise<any>[] = [];

      // If image exists, upload it in parallel
      if (imageBuffer) {
        const imageUploadPromise = pinImageToPinata(imageBuffer, `${formData.metadataName}-logo`, {
          keyvalues: {
            coinName: formData.metadataName,
            coinSymbol: formData.metadataSymbol,
            type: "coin-logo",
          },
        }).then((imageUri) => {
          metadata.image = imageUri;
        });
        uploadPromises.push(imageUploadPromise);
      }

      // Wait for image upload if needed
      if (uploadPromises.length > 0) {
        await Promise.all(uploadPromises);
      }

      // Upload metadata
      const metadataUri = await pinJsonToPinata(metadata);

      setIsUploading(false);

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

      // Call launch() directly without simulation
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
        {/* Terminal-style Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-mono font-bold text-foreground leading-tight whitespace-pre-line">
            {headerText}
          </h1>
        </div>

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
                <span className="text-muted-foreground text-xs ml-2">{t("common.optional", "optional")}</span>
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
                <span className="text-muted-foreground text-xs ml-2">{t("common.optional", "optional")}</span>
              </Label>
              <ImageInput onChange={handleImageFileChange} />
              <p className="text-muted-foreground text-xs mt-1">
                {t("create.image_requirements", "Max 5MB, PNG/JPG/GIF supported")}
              </p>
            </div>
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

          {/* Gas Estimate */}
          {gasEstimate && (
            <div className="rounded-lg border-2 border-border bg-muted/50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t("create.estimated_gas_cost", "Estimated Gas Cost")}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">
                    {gasEstimate.eth} ETH
                    <span className="text-muted-foreground ml-1">(${gasEstimate.usd})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {gasEstimate.gas} gas @ {gasEstimate.gwei} gwei
                  </div>
                </div>
              </div>
            </div>
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

          {/* Advanced Details Toggle */}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowAdvancedDetails(!showAdvancedDetails)}
            className="w-full justify-between text-sm font-medium hover:bg-accent/50 transition-colors"
          >
            <span>{t("create.advanced_details", "Advanced Details")}</span>
            {showAdvancedDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>

          {/* Collapsible Advanced Details Section */}
          {showAdvancedDetails && (
            <div className="space-y-4 animate-fadeIn">
              {/* Parameters Display with Landing Page Style */}
              <div
                key={`params-${currentLang}`}
                className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200 p-3 sm:p-4 rounded-lg relative overflow-hidden group"
              >
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-primary/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="flex items-center gap-2 mb-2 sm:mb-3 relative z-10">
                  <div
                    className="w-3 h-3 rounded-full bg-primary shadow-sm animate-pulse"
                    style={{ boxShadow: "0 0 8px var(--primary)" }}
                  />
                  <h3 className="font-bold text-foreground text-base sm:text-lg flex items-center gap-2">
                    {getTranslated("create.instant_coin_sale", "Instant Coin Sale")}
                    <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                    <span className="text-sm text-muted-foreground font-normal">
                      {getTranslated("create.graduate_info", "Graduate at 10 ETH. Quadratic 69% - 4.2 ETH.")}
                    </span>
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:gap-3 text-xs sm:text-sm relative z-10">
                  <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3 rounded-lg">
                    <div className="font-bold text-foreground text-sm sm:text-base">
                      {getTranslated(
                        "create.oneshot_supply_breakdown",
                        "{{totalSupply}} Total: {{saleCap}} bonding curve + {{lpSupply}} liquidity",
                        {
                          totalSupply: displayValues.totalSupply,
                          saleCap: displayValues.saleCap,
                          lpSupply: displayValues.lpSupply,
                        },
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs mt-1">
                      {getTranslated(
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
                      {getTranslated("create.oneshot_sale_price", "Bonding Curve: Quadratic → Linear pricing")}
                    </div>
                    <div className="text-muted-foreground text-xs mt-1">
                      {getTranslated(
                        "create.oneshot_sale_note",
                        "Target: {{target}} ETH • Quadratic until {{quadCap}} sold ({{quadPercent}}%) • {{days}} day deadline",
                        {
                          target: displayValues.ethTarget,
                          quadCap: displayValues.quadCap,
                          quadPercent: Math.round(
                            (Number(ONE_SHOT_PARAMS.quadCap) / Number(ONE_SHOT_PARAMS.saleCap)) * 100,
                          ),
                          days: displayValues.days,
                        },
                      )}
                    </div>
                  </div>
                  <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3 rounded-lg">
                    <div className="font-bold text-foreground text-sm sm:text-base">
                      {getTranslated(
                        "create.oneshot_auto_liquidity",
                        "Auto-Finalization: Creates zAMM pool on success",
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs mt-1">
                      {getTranslated(
                        "create.oneshot_instant_trading",
                        "{{lpSupply}} tokens + ETH raised → {{fee}}% fee zAMM • Instant trading",
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
                <div className="mt-3 text-center">
                  <a
                    href="https://curve.zamm.eth.limo/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200 underline underline-offset-2"
                  >
                    {t("create.learn_more_zcurve")}
                  </a>
                </div>
              </div>
            </div>
          )}

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
            <Alert className="border-2 border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/50 fade-in shadow-lg md:-mx-8 lg:-mx-16 md:px-8 lg:px-12">
              <div className="space-y-6">
                {/* Header with icon and title */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {txLoading ? (
                      <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-600 border-t-transparent" />
                    ) : (
                      <div className="relative">
                        <CheckCircle2 className="h-12 w-12 text-green-600 pulse-success" />
                        <div className="absolute inset-0 h-12 w-12 bg-green-600 rounded-full animate-ping opacity-20" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <AlertTitle className="text-green-800 dark:text-green-200 text-2xl font-bold">
                      {txSuccess
                        ? t("create.transaction_confirmed", "Transaction Confirmed")
                        : t("create.transaction_submitted", "Transaction Submitted")}
                      !
                    </AlertTitle>
                    <p className="text-green-700 dark:text-green-300 text-base">
                      {txSuccess
                        ? t("create.launch_successful", "Your coin launch was successful!")
                        : t("create.launch_submitted", "Your oneshot launch has been submitted!")}
                    </p>
                    {txSuccess && redirectCountdown !== null && (
                      <p className="text-green-600 dark:text-green-400 text-base font-medium animate-pulse">
                        {t("create.redirecting_in", "Redirecting to your coin page in {{seconds}} seconds...", {
                          seconds: redirectCountdown,
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Transaction Hash */}
                <div className="bg-white dark:bg-green-900/30 rounded-lg p-4 sm:p-6 border border-green-300 dark:border-green-700">
                  <p className="text-sm sm:text-base font-medium text-green-700 dark:text-green-300 mb-3">
                    {t("common.transaction_hash", "Transaction Hash")}
                  </p>
                  <div className="bg-green-50 dark:bg-green-900/20 p-3 sm:p-4 rounded-md overflow-x-auto">
                    <p className="font-mono text-xs sm:text-sm lg:text-base text-green-800 dark:text-green-200 break-all select-all">
                      {hash}
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <a
                    href={`https://etherscan.io/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 font-medium text-base shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                      />
                    </svg>
                    {t("common.view_on_etherscan", "View on Etherscan")}
                  </a>

                  {launchId !== null && (
                    <Link
                      to="/c/$coinId"
                      params={{ coinId: launchId.toString() }}
                      className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 font-medium text-base shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                      <Rocket className="w-5 h-5" />
                      {t("create.view_coin_sale", "View Coin Sale")}
                    </Link>
                  )}

                  <Link
                    to="/explore"
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg transition-all duration-200 font-medium text-base shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                      />
                    </svg>
                    {t("create.view_all_coins", "View All Coins")}
                  </Link>
                </div>

                {/* Loading indicator for transaction confirmation */}
                {txLoading && (
                  <div className="flex items-center justify-center gap-3 text-base text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 rounded-lg p-3">
                    <div className="w-3 h-3 bg-green-600 rounded-full animate-pulse" />
                    {t("create.waiting_for_confirmation", "Waiting for blockchain confirmation...")}
                  </div>
                )}

                {/* Try other launches */}
                {txSuccess && (
                  <div className="border-t border-green-300 dark:border-green-700 pt-4">
                    <Link
                      to="/launch"
                      className="inline-flex items-center gap-2 text-green-700 dark:text-green-300 hover:text-green-800 dark:hover:text-green-200 font-medium transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {t("create.try_other_launches", "Try other launches")}
                    </Link>
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
            {t("navigation.try_other_launches", "Try other launches")}
          </Link>
        </div>
      </div>

      {/* Progressive video animation - always visible, grows with form completion */}
      <div className="fixed bottom-5 right-5">
        <video
          className="transition-all duration-1000 ease-out"
          style={{
            clipPath: "polygon(50% 10%, 75% 50%, 50% 90%, 25% 50%)",
            width: `${80 + formCompletionPercentage * 0.8}px`,
            height: `${80 + formCompletionPercentage * 0.8}px`,
            opacity: 0.3 + (formCompletionPercentage / 100) * 0.7,
            filter: `brightness(${0.5 + (formCompletionPercentage / 100) * 0.5}) contrast(${0.8 + (formCompletionPercentage / 100) * 0.4})`,
            boxShadow: `0 0 ${20 + formCompletionPercentage * 0.3}px rgba(var(--primary-rgb), ${0.2 + (formCompletionPercentage / 100) * 0.3})`,
          }}
          src={theme === "dark" ? "/zammzamm-bw.mp4" : "/zammzamm.mp4"}
          autoPlay
          loop
          muted
          playsInline
        />
      </div>
    </div>
  );
}
