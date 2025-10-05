import React, { useState } from "react";
import { z } from "zod";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
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
  resolver: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  closingTime: z.string().min(1, "Closing time is required"),
  canAccelerateClosing: z.boolean(),
});

type FormData = z.infer<typeof schema>;

interface CreateMarketFormProps {
  onMarketCreated?: () => void;
}

export const CreateMarketForm: React.FC<CreateMarketFormProps> = ({ onMarketCreated }) => {
  const { t } = useTranslation();
  const { address: account } = useAccount();

  const {
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();

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
    resolver: account || "",
    closingTime: getDefaultClosingTime(),
    canAccelerateClosing: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (account && !form.resolver) {
      setForm((prev) => ({ ...prev, resolver: account }));
    }
  }, [account]);

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
      toast.info("Preparing market metadata…");

      // 1) Pin image (or fetch default zamm logo if none provided)
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
        // Fetch the default zamm logo and pin it
        const response = await fetch("/zammzamm.png");
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        imgUri = await pinImageToPinata(arrayBuffer, `${parsed.name}-default-logo`, {
          keyvalues: {
            marketName: parsed.name,
            marketSymbol: parsed.symbol,
            type: "prediction-market-default",
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

      await writeContractAsync({
        address: PredictionMarketAddress as `0x${string}`,
        abi: PredictionMarketAbi,
        functionName: "createMarket",
        args: [
          tokenUri,
          parsed.resolver as `0x${string}`,
          BigInt(closingTimestamp),
          parsed.canAccelerateClosing,
        ],
      });

      toast.success("Market creation transaction submitted");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to create market");
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <Heading level={3} className="mb-4">
        Create Prediction Market
      </Heading>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Market Name</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. ETH will reach $10k by 2026"
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              value={form.symbol}
              onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))}
              placeholder="e.g. ETH10K"
              maxLength={20}
            />
            {errors.symbol && <p className="text-xs text-red-500">{errors.symbol}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Detailed description of the market outcome…"
            />
            {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="image">Market Image</Label>
            <ImageInput onChange={handleImageChange} />
            <p className="text-xs text-muted-foreground">
              PNG/JPG/GIF • Max 5MB
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="resolver">Resolver Address</Label>
            <Input
              id="resolver"
              value={form.resolver}
              onChange={(e) => setForm((p) => ({ ...p, resolver: e.target.value }))}
              placeholder="0x..."
            />
            <p className="text-xs text-muted-foreground">
              Address that will resolve the market outcome
            </p>
            {errors.resolver && <p className="text-xs text-red-500">{errors.resolver}</p>}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="closingTime">Closing Time</Label>
            <Input
              id="closingTime"
              type="datetime-local"
              value={form.closingTime}
              onChange={(e) => setForm((p) => ({ ...p, closingTime: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              When trading closes and resolution can begin
            </p>
            {errors.closingTime && <p className="text-xs text-red-500">{errors.closingTime}</p>}
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="canAccelerateClosing"
              checked={form.canAccelerateClosing}
              onCheckedChange={(checked) =>
                setForm((p) => ({ ...p, canAccelerateClosing: checked }))
              }
            />
            <Label htmlFor="canAccelerateClosing" className="flex items-center gap-1">
              Allow resolver to accelerate closing
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>
                    When enabled, the resolver can call <code>closeMarket()</code> to end trading before the scheduled closing time.
                    This is useful if the outcome becomes certain early. When disabled, trading continues until the closing time.
                  </p>
                </TooltipContent>
              </Tooltip>
            </Label>
          </div>

          {!account && (
            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
              <AlertTitle className="text-blue-800 dark:text-blue-200">
                {t("common.wallet_required")}
              </AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                {t("common.connect_wallet_to_continue")}
              </AlertDescription>
            </Alert>
          )}

          {writeError && (
            <Alert tone="destructive">
              <AlertTitle>Transaction error</AlertTitle>
              <AlertDescription className="break-words">
                {writeError.message}
              </AlertDescription>
            </Alert>
          )}

          <Button
            disabled={submitting || isPending || !account}
            className="w-full"
            onClick={onSubmit}
          >
            {submitting || isPending ? "Creating…" : "Create Market"}
          </Button>

          {txLoading && (
            <Alert>
              <AlertTitle>Waiting for confirmation…</AlertTitle>
              <AlertDescription>Your transaction is being mined.</AlertDescription>
            </Alert>
          )}

          {txSuccess && (
            <Alert>
              <AlertTitle>Market Created!</AlertTitle>
              <AlertDescription>Your prediction market has been created successfully.</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Preview */}
        <div className="bg-muted rounded-lg p-6 flex flex-col h-full">
          <Heading level={4} className="mb-4">
            Preview
          </Heading>

          <div className="space-y-4 mb-6">
            <img
              src={imagePreviewUrl || "/zammzamm.png"}
              alt="Market preview"
              className="w-full h-48 object-contain rounded-lg border border-border bg-background"
            />
            {form.name && (
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-bold">{form.name}</p>
              </div>
            )}
            {form.symbol && (
              <div>
                <p className="text-xs text-muted-foreground">Symbol</p>
                <p className="font-mono">{form.symbol}</p>
              </div>
            )}
            {form.description && (
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p className="text-sm">{form.description}</p>
              </div>
            )}
            {form.closingTime && (
              <div>
                <p className="text-xs text-muted-foreground">Closes</p>
                <p className="text-sm">
                  {new Date(form.closingTime).toLocaleString()}
                </p>
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
