import { zCurveAbi, zCurveAddress } from "@/constants/zCurve";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { type ChangeEvent, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { z } from "zod";
import { ZCurveBondingChart } from "@/components/ZCurveBondingChart";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ImageInput } from "@/components/ui/image-input";
import { Input } from "@/components/ui/input";
// shadcn components
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { parseEther } from "viem";

// UNIT_SCALE from zCurve contract - all coin amounts must be multiples of this
const UNIT_SCALE = 1e12;

// Helper to ensure values are properly quantized to UNIT_SCALE
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

// Validation schema
const oneShotFormSchema = z.object({
  metadataName: z.string().min(1).max(100),
  metadataSymbol: z.string().min(1).max(50),
  metadataDescription: z.string().max(500).optional(),
});

type OneShotFormValues = z.infer<typeof oneShotFormSchema>;

// Helper function to format token amounts in human-readable format
const formatTokenAmount = (amount: bigint): string => {
  const tokens = Number(amount / parseEther("1"));
  if (tokens >= 1000000000) {
    return (tokens / 1000000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + "B";
  } else if (tokens >= 1000000) {
    return (tokens / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + "M";
  } else if (tokens >= 1000) {
    return (tokens / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + "K";
  }
  return tokens.toLocaleString(undefined, { maximumFractionDigits: 0 });
};

// Helper function to format ETH amounts
const formatEthAmount = (amount: bigint): string => {
  const eth = Number(amount) / 1e18;
  if (eth < 0.01) {
    return eth.toFixed(3);
  } else if (eth < 1) {
    return eth.toFixed(2);
  }
  return eth.toFixed(1);
};

export const OneShotLaunchForm = () => {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { address: account } = useAccount();
  const { t } = useTranslation();
  const publicClient = usePublicClient();

  // Transaction success monitoring
  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({
    hash,
  });

  // State for form data
  const [formData, setFormData] = useState<OneShotFormValues>({
    metadataName: "",
    metadataSymbol: "",
    metadataDescription: "",
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

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

  // Launch tracking state
  const [launchId, setLaunchId] = useState<bigint | null>(null);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
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
        for (const err of error.errors) {
          if (err.path.length > 0) {
            newErrors[err.path[0] as string] = err.message;
          }
        }
        setErrors(newErrors);
      }
      return false;
    }
  };

  const handleImageFileChange = (file: File | File[] | undefined) => {
    if (file && !Array.isArray(file)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBuffer(e.target?.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(file);
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

      // Upload image to Pinata if provided
      let imageUrl = "";
      if (imageBuffer) {
        toast.info(t("create.uploading_image", "Uploading image..."));
        const imageUri = await pinImageToPinata(imageBuffer, `${formData.metadataName}-logo`, {
          name: `${formData.metadataName}-logo`,
        });
        imageUrl = imageUri;
      }

      // Create metadata object
      const metadata = {
        name: formData.metadataName,
        symbol: formData.metadataSymbol,
        description: formData.metadataDescription || "",
        image: imageUrl,
      };

      // Upload metadata to Pinata
      toast.info(t("create.uploading_metadata", "Uploading metadata..."));
      const metadataUri = await pinJsonToPinata(metadata);

      setIsUploading(false);
      toast.info(t("create.starting_blockchain_transaction", "Starting blockchain transaction..."));

      // Pack quadCap with LP unlock flags (0 means keep in zCurve)
      const quadCapWithFlags = ONE_SHOT_PARAMS.quadCap; // No LP unlock, so just the quadCap value

      // Validate divisor
      if (!ONE_SHOT_PARAMS.divisor || ONE_SHOT_PARAMS.divisor === 0n) {
        toast.error(t("create.invalid_configuration", "Invalid configuration: divisor calculation failed"));
        setIsUploading(false);
        return;
      }

      // Simulate contract to get the predicted coin ID
      const contractArgs = [
        ONE_SHOT_PARAMS.creatorSupply, // creatorSupply: 0
        BigInt(ONE_SHOT_PARAMS.creatorUnlock), // creatorUnlock: 0
        ONE_SHOT_PARAMS.saleCap, // saleCap: 800M tokens (as uint96)
        ONE_SHOT_PARAMS.lpSupply, // lpSupply: 200M tokens (as uint96)
        ONE_SHOT_PARAMS.ethTarget, // ethTargetWei: 0.01 ETH (as uint128)
        ONE_SHOT_PARAMS.divisor, // divisor: hardcoded value
        BigInt(ONE_SHOT_PARAMS.feeOrHook), // feeOrHook: 30 (0.3% fee)
        quadCapWithFlags, // quadCapWithFlags: quadCap with no LP unlock
        BigInt(ONE_SHOT_PARAMS.duration), // duration: 2 weeks (as uint56)
        metadataUri, // uri: metadata URI
      ] as const;

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

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="max-w-2xl mx-auto">
        {/* Parameters Display with Landing Page Style */}
        <div className="border-2 border-border bg-background hover:shadow-lg transition-all duration-200 p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div
              className="w-3 h-3 rounded-full bg-primary shadow-sm"
              style={{ boxShadow: "0 0 8px var(--primary)" }}
            />
            <h3 className="font-bold text-foreground text-base sm:text-lg">
              {t("create.instant_coin_sale", "zCurve Bonding Curve Launch")}
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:gap-3 text-xs sm:text-sm">
            <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3">
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
            <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3">
              <div className="font-bold text-foreground text-sm sm:text-base">
                {t("create.oneshot_sale_price", "Bonding Curve: Quadratic → Linear pricing")}
              </div>
              <div className="text-muted-foreground text-xs mt-1">
                {t(
                  "create.oneshot_sale_note",
                  "Target: {{target}} ETH • Quadratic until {{quadCap}} sold • {{days}} day deadline",
                  {
                    target: displayValues.ethTarget,
                    quadCap: displayValues.quadCap,
                    days: displayValues.days,
                  },
                )}
              </div>
            </div>
            <div className="border-2 border-border bg-background hover:shadow-md transition-all duration-200 p-2 sm:p-3">
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
        <div className="mb-6">
          <ZCurveBondingChart
            saleCap={ONE_SHOT_PARAMS.saleCap}
            divisor={ONE_SHOT_PARAMS.divisor}
            ethTarget={ONE_SHOT_PARAMS.ethTarget}
            quadCap={ONE_SHOT_PARAMS.quadCap}
            currentSold={BigInt(0)}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Token Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="metadataName" className="mb-2">
                {t("create.name", "Name")} *
              </Label>
              <Input
                id="metadataName"
                name="metadataName"
                value={formData.metadataName}
                onChange={handleInputChange}
                placeholder={t("create.enter_name", "Enter coin name")}
                className={errors.metadataName ? "border-red-500" : ""}
              />
              {errors.metadataName && <p className="text-red-500 text-sm mt-2">{errors.metadataName}</p>}
            </div>

            <div>
              <Label htmlFor="metadataSymbol" className="mb-2">
                {t("create.symbol", "Symbol")} *
              </Label>
              <Input
                id="metadataSymbol"
                name="metadataSymbol"
                value={formData.metadataSymbol}
                onChange={handleInputChange}
                placeholder={t("create.enter_symbol", "Enter coin symbol")}
                className={errors.metadataSymbol ? "border-red-500" : ""}
                maxLength={50}
              />
              {errors.metadataSymbol && <p className="text-red-500 text-sm mt-2">{errors.metadataSymbol}</p>}
            </div>

            <div>
              <Label htmlFor="metadataDescription" className="mb-2">
                {t("create.description", "Description")}
              </Label>
              <Textarea
                id="metadataDescription"
                name="metadataDescription"
                value={formData.metadataDescription}
                onChange={handleInputChange}
                placeholder={t("create.enter_description", "Describe your coin")}
                rows={3}
              />
            </div>

            <div>
              <Label className="mb-2">{t("create.image", "Image")}</Label>
              <ImageInput onChange={handleImageFileChange} />
            </div>
          </div>

          {/* Submit Button with Landing Style */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              type="submit"
              disabled={isPending || !account || isUploading}
              className="flex-1 min-h-[44px] font-bold border-2 hover:shadow-lg transition-all duration-200"
              size="lg"
            >
              {isUploading
                ? t("common.uploading", "Uploading...")
                : isPending
                  ? t("create.launching", "Launching...")
                  : t("common.launch", "Launch")}
            </Button>
          </div>

          {!account && (
            <div className="text-center">
              <p className="text-muted-foreground text-sm">
                {t("common.connect_wallet_to_continue", "Please connect your wallet to continue")}
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}

          {/* Transaction Success Display */}
          {hash && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
              <AlertTitle className="text-green-800">
                {txLoading ? "⏳" : txSuccess ? "✅" : "📤"}{" "}
                {txSuccess
                  ? t("create.transaction_confirmed", "Transaction Confirmed")
                  : t("create.transaction_submitted", "Transaction Submitted")}
                !
              </AlertTitle>
              <AlertDescription className="text-green-700">
                {txSuccess
                  ? t("create.launch_successful", "Your coin launch was successful!")
                  : t("create.launch_submitted", "Your oneshot launch has been submitted!")}
                <div className="mt-2 space-y-2">
                  <div className="text-xs font-mono bg-green-100 dark:bg-green-900 p-2 rounded break-all">
                    {t("common.transaction_hash", "Transaction")}: {hash}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <a
                      href={`https://etherscan.io/tx/${hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:text-green-800 text-sm underline"
                    >
                      View on Etherscan →
                    </a>
                    {launchId !== null && (
                      <Link
                        to="/c/$coinId"
                        params={{ coinId: launchId.toString() }}
                        className="text-green-600 hover:text-green-800 text-sm underline"
                      >
                        View Coin Sale →
                      </Link>
                    )}
                    <Link to="/explore" className="text-green-600 hover:text-green-800 text-sm underline">
                      {t("create.view_all_coins", "View All Coins")} →
                    </Link>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </form>

        {/* Back to Launch */}
        <div className="text-center mt-8 pb-4">
          <Link
            to="/launch"
            className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 text-sm"
          >
            <span>←</span>
            {t("navigation.back_to_advanced_launch", "Back to Advanced Launch")}
          </Link>
        </div>
      </div>
    </div>
  );
};
