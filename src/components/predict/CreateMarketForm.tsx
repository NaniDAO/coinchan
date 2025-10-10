import React, { useState } from "react";
import { z } from "zod";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useEnsAddress } from "wagmi";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { parseEther, isAddress } from "viem";
import { normalize } from "viem/ens";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAddress, PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageInput } from "@/components/ui/image-input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Heading } from "@/components/ui/typography";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { ScrollingPredictions } from "./ScrollingPredictions";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  symbol: z.string().trim().min(1, "Symbol is required").max(20),
  description: z.string().trim().max(2000).optional().default(""),
  resolver: z.string().min(1, "Resolver address or ENS name is required"),
  closingTime: z.string().min(1, "Closing time is required"),
  canAccelerateClosing: z.boolean(),
  marketType: z.enum(["parimutuel", "amm"]),
});

type FormData = z.infer<typeof schema>;
//type MarketType = "parimutuel" | "amm";

interface CreateMarketFormProps {
  onMarketCreated?: () => void;
}

export const CreateMarketForm: React.FC<CreateMarketFormProps> = ({ onMarketCreated }) => {
  const { t } = useTranslation();
  const { address: account } = useAccount();

  const { writeContractAsync, data: hash, isPending, error: writeError } = useWriteContract();

  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });

  // Default closing time to one week from now
  const getDefaultClosingTime = () => {
    const oneWeekFromNow = new Date();
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
    return oneWeekFromNow.toISOString().slice(0, 16); // Format for datetime-local input
  };

  const [form, setForm] = useState<FormData>({
    name: "",
    symbol: "",
    description: "",
    resolver: "",
    closingTime: getDefaultClosingTime(),
    canAccelerateClosing: false,
    marketType: "parimutuel",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Generate preview SVG URL for display
  const getPreviewImageUrl = (): string => {
    if (imagePreviewUrl) return imagePreviewUrl;
    if (!form.name) return "/zammzamm.png";

    // Generate SVG for preview (use symbol if available, otherwise use empty string)
    const svgBuffer = generateSvgImage(form.name, form.symbol || "");
    const svgBlob = new Blob([svgBuffer], { type: "image/svg+xml" });
    return URL.createObjectURL(svgBlob);
  };

  // ENS resolution for resolver field
  const isEnsName = form.resolver.includes(".") && !form.resolver.startsWith("0x");
  const { data: ensAddress, isLoading: isResolvingEns } = useEnsAddress({
    name: isEnsName ? normalize(form.resolver) : undefined,
    query: {
      enabled: isEnsName,
    },
  });

  React.useEffect(() => {
    if (txSuccess && onMarketCreated) {
      onMarketCreated();
      // Reset form
      setForm({
        name: "",
        symbol: "",
        description: "",
        resolver: account || "",
        closingTime: getDefaultClosingTime(),
        canAccelerateClosing: false,
        marketType: "parimutuel",
      });
      setImageBuffer(null);
      setImagePreviewUrl("");
      setSubmitting(false);
    }
  }, [txSuccess, onMarketCreated, account]);

  const handleImageChange = async (file: File | File[] | undefined) => {
    if (!file || Array.isArray(file)) {
      setImageBuffer(null);
      setImagePreviewUrl("");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }
    setImageBuffer(await file.arrayBuffer());
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  const validate = () => {
    try {
      const parsed = schema.parse(form);
      setErrors({});
      return parsed;
    } catch (e) {
      if (e instanceof z.ZodError) {
        const map: Record<string, string> = {};
        e.issues.forEach((i) => (map[i.path.join(".")] = i.message));
        setErrors(map);
      }
      return null;
    }
  };

  // Generate SVG image with random color
  const generateSvgImage = (name: string, symbol: string): ArrayBuffer => {
    // Array of bright, high-contrast colors
    const brightColors = [
      "#00BFFF", // Deep Sky Blue
      "#FF69B4", // Hot Pink
      "#FFD700", // Gold
      "#00FF7F", // Spring Green
      "#FF6347", // Tomato
      "#9370DB", // Medium Purple
      "#20B2AA", // Light Sea Green
      "#FF8C00", // Dark Orange
      "#DA70D6", // Orchid
      "#00CED1", // Dark Turquoise
      "#FFB6C1", // Light Pink
      "#98FB98", // Pale Green
      "#DDA0DD", // Plum
      "#F0E68C", // Khaki
      "#87CEEB", // Sky Blue
    ];

    // Pick a random color
    const bgColor = brightColors[Math.floor(Math.random() * brightColors.length)];

    // Split name into lines (max 3 lines, wrap at ~20 chars or natural break)
    const words = name.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= 20) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
        if (lines.length >= 2) break; // Max 3 lines
      }
    }
    if (currentLine) lines.push(currentLine);

    // Add symbol line if symbol exists
    if (symbol) {
      lines.push(`(${symbol})`);
    }

    // Generate SVG
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="${bgColor}"/>
  <text x="200" y="200" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#000000" text-anchor="middle" dominant-baseline="middle">
${lines
  .map((line, i) => {
    const offset = (i - (lines.length - 1) / 2) * 30;
    return `    <tspan x="200" dy="${i === 0 ? offset : 30}">${line}</tspan>`;
  })
  .join("\n")}
  </text>
</svg>`;

    // Convert SVG string to ArrayBuffer
    const encoder = new TextEncoder();
    return encoder.encode(svg).buffer;
  };

  const onSubmit = async () => {
    const parsed = validate();
    if (!parsed) {
      toast.error("Please fix the form errors");
      return;
    }
    if (!account) {
      toast.error("Please connect your wallet");
      return;
    }

    try {
      setSubmitting(true);

      // Resolve ENS name to address if needed
      let resolverAddress: string;
      if (isEnsName) {
        if (isResolvingEns) {
          toast.info("Resolving ENS name…");
          await new Promise((resolve) => setTimeout(resolve, 500)); // Brief wait for resolution
        }
        if (!ensAddress) {
          toast.error("Could not resolve ENS name");
          setSubmitting(false);
          return;
        }
        resolverAddress = ensAddress;
      } else if (isAddress(parsed.resolver)) {
        resolverAddress = parsed.resolver;
      } else {
        toast.error("Invalid resolver address or ENS name");
        setSubmitting(false);
        return;
      }

      toast.info("Preparing market metadata…");

      // 1) Pin image (generate SVG if none provided)
      let imgUri: string;
      if (imageBuffer) {
        imgUri = await pinImageToPinata(imageBuffer, `${parsed.name}-image`, {
          keyvalues: {
            marketName: parsed.name,
            marketSymbol: parsed.symbol,
            type: "prediction-market",
          },
        });
      } else {
        // Generate SVG image with random color
        const svgBuffer = generateSvgImage(parsed.name, parsed.symbol);
        imgUri = await pinImageToPinata(svgBuffer, `${parsed.name}-generated.svg`, {
          keyvalues: {
            marketName: parsed.name,
            marketSymbol: parsed.symbol,
            type: "prediction-market-generated",
          },
        });
      }

      // 2) Pin metadata JSON
      const metadata = {
        name: parsed.name,
        symbol: parsed.symbol,
        description: parsed.description || undefined,
        image: imgUri,
      };
      const tokenUri = await pinJsonToPinata(metadata);

      // 3) Convert closing time to timestamp
      const closingTimestamp = Math.floor(new Date(parsed.closingTime).getTime() / 1000);

      if (closingTimestamp <= Math.floor(Date.now() / 1000)) {
        toast.error("Closing time must be in the future");
        setSubmitting(false);
        return;
      }

      toast.info("Creating market…");

      if (parsed.marketType === "parimutuel") {
        // Pari-mutuel market (existing PredictionMarket contract)
        await writeContractAsync({
          address: PredictionMarketAddress as `0x${string}`,
          abi: PredictionMarketAbi,
          functionName: "createMarket",
          args: [tokenUri, resolverAddress as `0x${string}`, BigInt(closingTimestamp), parsed.canAccelerateClosing],
        });
      } else {
        // AMM-based market (PredictionAMM contract) with sensible default seeding
        // Seed with 1 YES token and 1 NO token for 50/50 starting probability
        const seedYes = parseEther("1");
        const seedNo = parseEther("1");

        await writeContractAsync({
          address: PredictionAMMAddress as `0x${string}`,
          abi: PredictionAMMAbi,
          functionName: "createMarket",
          args: [
            tokenUri,
            resolverAddress as `0x${string}`,
            BigInt(closingTimestamp),
            parsed.canAccelerateClosing,
            seedYes,
            seedNo,
          ],
        });
      }

      toast.success("Market creation transaction submitted");
    } catch (err: any) {
      console.error(err);

      // Handle wallet rejection gracefully
      if (err?.code === 4001 || err?.code === "ACTION_REJECTED") {
        toast.info("Transaction cancelled");
        setSubmitting(false);
        return;
      }

      // Handle user rejection messages
      const errorMessage = err?.shortMessage ?? err?.message ?? "";
      if (
        errorMessage.toLowerCase().includes("user rejected") ||
        errorMessage.toLowerCase().includes("user denied") ||
        errorMessage.toLowerCase().includes("user cancelled") ||
        errorMessage.toLowerCase().includes("rejected by user")
      ) {
        toast.info("Transaction cancelled");
        setSubmitting(false);
        return;
      }

      // Other errors
      toast.error(errorMessage || "Failed to create market");
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <Heading level={3} className="mb-4">
        {t("predict.create_prediction_market")}
      </Heading>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("predict.market_name")}</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder={t("predict.market_name_placeholder")}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="symbol">{t("predict.symbol")}</Label>
            <Input
              id="symbol"
              value={form.symbol}
              onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))}
              placeholder={t("predict.symbol_placeholder")}
              maxLength={20}
            />
            {errors.symbol && <p className="text-xs text-red-500">{errors.symbol}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">{t("predict.description")}</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder={t("predict.description_placeholder")}
            />
            {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
          </div>

          <div className="grid gap-2">
            <Label>{t("predict.market_type")}</Label>
            <div className="flex flex-col gap-3">
              <div
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  form.marketType === "parimutuel"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setForm((p) => ({ ...p, marketType: "parimutuel" }))}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="marketType"
                    checked={form.marketType === "parimutuel"}
                    onChange={() => setForm((p) => ({ ...p, marketType: "parimutuel" }))}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{t("predict.parimutuel")}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t("predict.parimutuel_description")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t("predict.parimutuel_summary")}</p>
                  </div>
                </div>
              </div>

              <div
                className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                  form.marketType === "amm" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}
                onClick={() => setForm((p) => ({ ...p, marketType: "amm" }))}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="radio"
                    name="marketType"
                    checked={form.marketType === "amm"}
                    onChange={() => setForm((p) => ({ ...p, marketType: "amm" }))}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">{t("predict.live_bets_amm")}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>{t("predict.amm_description")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t("predict.amm_summary")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="image">
              {t("predict.market_image")}{" "}
              <span className="text-muted-foreground font-normal">({t("common.optional")})</span>
            </Label>
            <ImageInput onChange={handleImageChange} />
            <p className="text-xs text-muted-foreground">{t("predict.image_hint_optional")}</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="resolver">{t("predict.resolver_address")}</Label>
            <Input
              id="resolver"
              value={form.resolver}
              onChange={(e) => setForm((p) => ({ ...p, resolver: e.target.value }))}
              placeholder={t("predict.resolver_placeholder")}
            />
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{t("predict.resolver_address_help")}</p>
              {isResolvingEns && (
                <p className="text-xs text-blue-500 whitespace-nowrap">{t("predict.resolving_ens")}</p>
              )}
              {isEnsName && ensAddress && !isResolvingEns && (
                <p className="text-xs text-green-600 dark:text-green-400 whitespace-nowrap">
                  ✓ {ensAddress.slice(0, 6)}...{ensAddress.slice(-4)}
                </p>
              )}
            </div>
            {errors.resolver && <p className="text-xs text-red-500">{errors.resolver}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="closingTime">{t("predict.closing_time")}</Label>
            <Input
              id="closingTime"
              type="datetime-local"
              value={form.closingTime}
              onChange={(e) => setForm((p) => ({ ...p, closingTime: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t("predict.closing_time_help")}</p>
            {errors.closingTime && <p className="text-xs text-red-500">{errors.closingTime}</p>}
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="canAccelerateClosing"
              checked={form.canAccelerateClosing}
              onCheckedChange={(checked) => setForm((p) => ({ ...p, canAccelerateClosing: checked }))}
            />
            <Label htmlFor="canAccelerateClosing" className="flex items-center gap-1">
              {t("predict.allow_resolver_accelerate_closing")}
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>{t("predict.accelerate_closing_help")}</p>
                </TooltipContent>
              </Tooltip>
            </Label>
          </div>

          {!account && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <AlertTitle className="text-blue-800 dark:text-blue-200">{t("common.wallet_required")}</AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                {t("common.connect_wallet_to_continue")}
              </AlertDescription>
            </Alert>
          )}

          {writeError && (
            <Alert tone="destructive">
              <AlertTitle>{t("common.error")}</AlertTitle>
              <AlertDescription className="break-words">{writeError.message}</AlertDescription>
            </Alert>
          )}

          <Button disabled={submitting || isPending || !account} className="w-full" onClick={onSubmit}>
            {submitting || isPending ? t("predict.creating") : t("predict.create_market")}
          </Button>

          {txLoading && (
            <Alert>
              <AlertTitle>{t("predict.waiting_confirmation")}</AlertTitle>
              <AlertDescription>{t("predict.transaction_mining")}</AlertDescription>
            </Alert>
          )}

          {txSuccess && (
            <Alert>
              <AlertTitle>{t("predict.market_created")}</AlertTitle>
              <AlertDescription>{t("predict.market_created_description")}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Preview */}
        <div className="bg-muted rounded-lg p-6 flex flex-col h-full">
          <Heading level={4} className="mb-4">
            {t("predict.preview")}
          </Heading>

          <div className="space-y-4 mb-6">
            <img
              src={getPreviewImageUrl()}
              alt={t("predict.market_preview")}
              className="w-full h-48 object-contain rounded-lg border border-border bg-background"
            />
            {form.name && (
              <div>
                <p className="text-xs text-muted-foreground">{t("predict.name")}</p>
                <p className="font-bold">{form.name}</p>
              </div>
            )}
            {form.symbol && (
              <div>
                <p className="text-xs text-muted-foreground">{t("predict.symbol")}</p>
                <p className="font-mono">{form.symbol}</p>
              </div>
            )}
            {form.description && (
              <div>
                <p className="text-xs text-muted-foreground">{t("predict.description")}</p>
                <p className="text-sm">{form.description}</p>
              </div>
            )}
            {form.closingTime && (
              <div>
                <p className="text-xs text-muted-foreground">{t("predict.closes")}</p>
                <p className="text-sm">{new Date(form.closingTime).toLocaleString()}</p>
              </div>
            )}
          </div>

          <div className="rounded-lg overflow-hidden border border-border flex-1 min-h-[200px]">
            <div className="h-full">
              <ScrollingPredictions />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
