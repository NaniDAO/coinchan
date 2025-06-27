import { useState, ChangeEvent } from "react";
import { useWriteContract, useAccount } from "wagmi";
import { useTranslation } from "react-i18next";
import { ZAMMLaunchAddress, ZAMMLaunchAbi } from "@/constants/ZAMMLaunch";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { z } from "zod";

// shadcn components
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";

import { parseEther } from "viem";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

// Hardcoded parameters for one-shot launch
const ONE_SHOT_PARAMS = {
  totalCoins: 495000000, // 495mm coins in single tranche for sale
  creatorSupply: 10000000, // 10mm creator supply (1% of 1B total)
  totalTranchePrice: 1, // 1 ETH total cost for entire 495M coin tranche
  unlockDate: 0, // No unlock period - coins unlock after sale finalizes
};

// Validation schema
const oneShotFormSchema = z.object({
  metadataName: z.string().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
  metadataSymbol: z.string().min(1, "Symbol is required").max(10, "Symbol must be 10 characters or less").regex(/^[A-Z0-9]+$/, "Symbol must contain only uppercase letters and numbers"),
  metadataDescription: z.string().max(500, "Description must be 500 characters or less").optional(),
});

type OneShotFormValues = z.infer<typeof oneShotFormSchema>;

export const OneShotLaunchForm = () => {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const { address: account } = useAccount();
  const { t } = useTranslation();

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
        error.errors.forEach((err) => {
          if (err.path.length > 0) {
            newErrors[err.path[0] as string] = err.message;
          }
        });
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

      // Call launch() with hardcoded one-shot parameters
      writeContract({
        address: ZAMMLaunchAddress,
        abi: ZAMMLaunchAbi,
        functionName: "launch",
        args: [
          BigInt(ONE_SHOT_PARAMS.creatorSupply), // creatorSupply: 10mm tokens (1%)
          BigInt(ONE_SHOT_PARAMS.unlockDate), // unlockDate: 0 (unlocks after sale ends)
          metadataUri, // metadataURI
          [BigInt(ONE_SHOT_PARAMS.totalCoins)], // trancheCoins: [495mm] - single tranche
          [BigInt(parseEther(ONE_SHOT_PARAMS.totalTranchePrice.toString()))], // tranchePrice: [1 ETH] - total cost for entire tranche
        ],
      });

      toast.success("One-shot launch initiated!");
    } catch (error) {
      console.error("Launch error:", error);
      setIsUploading(false);
      toast.error("Failed to launch coin");
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 sm:py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">{t("create.oneshot_title", "One-Shot Launch")}</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("create.oneshot_description", "Launch your coin instantly with our simplified one-shot configuration")}
          </p>
        </div>

        {/* Parameters Display */}
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">⚡</span>
            <h3 className="font-semibold text-green-900">{t("create.one_shot_config", "One-Shot Configuration")}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <div className="bg-white/60 rounded p-3">
              <div className="font-medium text-green-800">
                495M {t("common.coins", "coins")} {t("create.for_sale", "for sale")} → 1 ETH {t("create.total", "total")}
              </div>
              <div className="text-green-600 text-xs mt-1">
                {t("create.otc_order", "OTC order - buyers can purchase any amount")}
              </div>
            </div>
            <div className="bg-white/60 rounded p-3">
              <div className="font-medium text-blue-800">
                {t("create.when_sold", "When sold")}: 495M + 1 ETH → {t("create.liquidity_pool", "Liquidity Pool")}
              </div>
              <div className="text-blue-600 text-xs mt-1">
                {t("create.instant_trading", "Instant trading available")}
              </div>
            </div>
            <div className="bg-white/60 rounded p-3">
              <div className="font-medium text-purple-800">
                10M {t("common.coins", "coins")} → {t("create.creator", "Creator")} ({t("create.unlocked_after_sale", "unlocked after sale")})
              </div>
              <div className="text-purple-600 text-xs mt-1">
                {t("create.fair_launch", "Only 1% to creator - fair launch")}
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Token Information */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="metadataName">{t("create.name", "Name")} *</Label>
              <Input
                id="metadataName"
                name="metadataName"
                value={formData.metadataName}
                onChange={handleInputChange}
                placeholder={t("create.enter_name", "Enter coin name")}
                className={errors.metadataName ? "border-red-500" : ""}
              />
              {errors.metadataName && (
                <p className="text-red-500 text-sm mt-1">{errors.metadataName}</p>
              )}
            </div>

            <div>
              <Label htmlFor="metadataSymbol">{t("create.symbol", "Symbol")} *</Label>
              <Input
                id="metadataSymbol"
                name="metadataSymbol"
                value={formData.metadataSymbol}
                onChange={handleInputChange}
                placeholder={t("create.enter_symbol", "Enter coin symbol")}
                className={errors.metadataSymbol ? "border-red-500" : ""}
                maxLength={10}
              />
              {errors.metadataSymbol && (
                <p className="text-red-500 text-sm mt-1">{errors.metadataSymbol}</p>
              )}
            </div>

            <div>
              <Label htmlFor="metadataDescription">{t("create.description", "Description")}</Label>
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
              <Label>{t("create.image", "Image")}</Label>
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
              {isUploading ? t("common.uploading", "Uploading...") : isPending ? t("create.launching", "Launching...") : t("create.launch_oneshot", "Launch One-Shot")}
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
              <AlertDescription>
                {error.message}
              </AlertDescription>
            </Alert>
          )}

          {/* Success Display */}
          {hash && (
            <Alert>
              <AlertTitle>Success!</AlertTitle>
              <AlertDescription>
                Your one-shot launch has been submitted. Transaction hash: {hash}
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