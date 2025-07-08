import { ZAMMLaunchAbi, ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { z } from "zod";

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

// Hardcoded parameters for one-shot launch (scaled to 18 decimals)
const ONE_SHOT_PARAMS = {
  totalCoins: parseEther("495000000"), // 495mm coins in single tranche for sale (18 decimals)
  creatorSupply: parseEther("10000000"), // 10mm creator supply (1% of 1B total) (18 decimals)
  totalTranchePrice: 1, // 1 ETH total cost for entire 495M coin tranche
  unlockDate: 0, // No unlock period - coins unlock after sale finalizes
};

// Validation schema
const oneShotFormSchema = z.object({
  metadataName: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
  metadataSymbol: z
    .string()
    .min(1, "Symbol is required")
    .max(10, "Symbol must be 10 characters or less")
    .regex(/^[A-Z0-9]+$/, "Symbol must contain only uppercase letters and numbers"),
  metadataDescription: z.string().max(500, "Description must be 500 characters or less").optional(),
});

type OneShotFormValues = z.infer<typeof oneShotFormSchema>;

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
      toast.error("Please fix the form errors");
      return;
    }

    if (!account) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      setIsUploading(true);

      // Upload image to Pinata if provided
      let imageUrl = "";
      if (imageBuffer) {
        toast.info("Uploading image...");
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
      toast.info("Uploading metadata...");
      const metadataUri = await pinJsonToPinata(metadata);

      setIsUploading(false);
      toast.info("Starting blockchain transaction...");

      // Simulate contract to get the predicted coin ID
      const contractArgs = [
        ONE_SHOT_PARAMS.creatorSupply, // creatorSupply: 10mm tokens (1%) - already in wei
        BigInt(ONE_SHOT_PARAMS.unlockDate), // unlockDate: 0 (unlocks after sale ends)
        metadataUri, // metadataURI
        [ONE_SHOT_PARAMS.totalCoins], // trancheCoins: [495mm] - single tranche - already in wei
        [BigInt(parseEther(ONE_SHOT_PARAMS.totalTranchePrice.toString()))], // tranchePrice: [1 ETH] - total cost for entire tranche
      ] as const;

      if (publicClient) {
        try {
          // Simulate the transaction to get the predicted coin ID
          const { result } = await publicClient.simulateContract({
            account,
            address: ZAMMLaunchAddress,
            abi: ZAMMLaunchAbi,
            functionName: "launch",
            args: contractArgs,
          });

          // Set the predicted launch ID
          setLaunchId(result);
        } catch (simError) {
          console.warn("Contract simulation failed, proceeding without coin ID prediction:", simError);
        }
      }

      // Call launch() with hardcoded one-shot parameters
      writeContract({
        address: ZAMMLaunchAddress,
        abi: ZAMMLaunchAbi,
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
        const errorMessage = handleWalletError(error);
        toast.error(errorMessage || t("create.launch_failed", "Failed to launch coin. Please try again."));
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="max-w-2xl mx-auto">
        {/* Parameters Display */}
        <div className="bg-muted/30 border-2 border-border rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚡</span>
            <h3 className="font-semibold text-foreground">{t("create.instant_coin_sale", "Instant Coin Sale")}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="bg-background border border-border rounded p-3">
              <div className="font-medium text-foreground">
                {t("create.oneshot_supply_breakdown", "1B Total: 495M sale + 495M liquidity + 10M creator")}
              </div>
              <div className="text-muted-foreground text-xs mt-1">
                {t("create.oneshot_percentages", "49.5% public • 49.5% locked • 1% creator")}
              </div>
            </div>
            <div className="bg-background border border-border rounded p-3">
              <div className="font-medium text-foreground">
                {t("create.oneshot_sale_price", "Sale: 495M coins for 1 ETH total")}
              </div>
              <div className="text-muted-foreground text-xs mt-1">
                {t("create.oneshot_sale_note", "Anyone can buy any amount")}
              </div>
            </div>
            <div className="bg-background border border-border rounded p-3">
              <div className="font-medium text-foreground">
                {t("create.oneshot_auto_liquidity", "Auto-liquidity: 495M + 1 ETH → Trading Pool")}
              </div>
              <div className="text-muted-foreground text-xs mt-1">
                {t("create.oneshot_instant_trading", "Enables instant trading when sale completes")}
              </div>
            </div>
          </div>
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
                maxLength={10}
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

          {/* Submit Button */}
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              type="submit"
              disabled={isPending || !account || isUploading}
              className="flex-1 min-h-[44px]"
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
            <Alert className="border-green-200 bg-green-50">
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
                  <div className="text-xs font-mono bg-green-100 p-2 rounded break-all">
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
