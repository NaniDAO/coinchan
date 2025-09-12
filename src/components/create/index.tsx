import React, { useMemo, useState } from "react";
import { z } from "zod";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther } from "viem";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";

import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { LivePreview } from "./LivePreview";
import { Heading } from "../ui/typography";
import { useLiveCoinId } from "@/hooks/use-live-coin-id";

export type SimpleForm = {
  name: string;
  symbol: string;
  description: string;
  supply: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required")
    .max(12, "Max 12 characters")
    .regex(/^[A-Za-z0-9_$.-]+$/, "Only A–Z, a–z, 0–9, _ $ . -"),
  description: z.string().trim().max(1000).optional().default(""),
  supply: z
    .number({ invalid_type_error: "Enter a number" })
    .int("Whole coins only")
    .positive("Must be greater than 0")
    .max(10_000_000_000, "Too large"),
});

export const CreateCoinWizard: React.FC = () => {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();
  const {
    data: receipt,
    isSuccess: txSuccess,
    isLoading: txLoading,
  } = useWaitForTransactionReceipt({ hash });

  const [form, setForm] = useState<SimpleForm>({
    name: "",
    symbol: "",
    description: "",
    supply: 100_000_000,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>(""); // local preview until pin
  const [submitting, setSubmitting] = useState(false);
  const [coinId, setCoinId] = useState<bigint | null>(null);
  const { data: liveCoinId } = useLiveCoinId();

  const handleNumber = (raw: string) => {
    const value = raw.replace(/,/g, "");
    const n = Number(value);
    setForm((p) => ({
      ...p,
      supply: Number.isFinite(n) ? Math.floor(n) : 0,
    }));
  };

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
    setImagePreviewUrl(URL.createObjectURL(file)); // local preview only
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicClient) return;
    const parsed = validate();
    if (!parsed) {
      toast.error("Please fix the form errors");
      return;
    }
    if (!account) {
      toast.error("Please connect your wallet");
      return;
    }
    if (!imageBuffer) {
      toast.error("Please upload a logo image");
      return;
    }

    try {
      setSubmitting(true);
      toast.info("Preparing your coin…");

      // 1) Pin image first (we only show local preview until now)
      const imgUri = await pinImageToPinata(
        imageBuffer,
        `${parsed.name}-logo`,
        {
          keyvalues: {
            coinName: parsed.name,
            coinSymbol: parsed.symbol,
            type: "coin-logo",
          },
        },
      );

      // 2) Pin metadata JSON with the pinned image URI
      const metadata = {
        name: parsed.name,
        symbol: parsed.symbol,
        description: parsed.description || undefined,
        image: imgUri, // <-- IPFS/Pinata URL from step 1
      };
      const tokenUri = await pinJsonToPinata(metadata);

      // 3) (Optional) simulate to get the new coinId for UX
      const sim = await publicClient.simulateContract({
        abi: CookbookAbi,
        address: CookbookAddress,
        functionName: "coin",
        args: [account, parseEther(parsed.supply.toString()), tokenUri],
      });
      const predictedCoinId = sim.result as unknown as bigint; // depends on your ABI return
      setCoinId(predictedCoinId);

      // 4) Fire the transaction
      writeContract({
        abi: CookbookAbi,
        address: CookbookAddress,
        functionName: "coin",
        args: [account, parseEther(parsed.supply.toString()), tokenUri],
      });

      toast.success("Transaction submitted");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to create coin");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Big Live Preview */}
        <LivePreview
          coinId={liveCoinId?.toString()}
          form={form}
          imagePreviewUrl={imagePreviewUrl}
        />
        {/* Form */}
        <div>
          <div className="mb-4">
            <Heading level={3}>Create Coin</Heading>
            <p className="text-sm text-secondary-foreground">
              Enter the details of your coin.
            </p>
          </div>
          <div>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Wizard Coin"
                />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={form.symbol}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, symbol: e.target.value }))
                  }
                  placeholder="e.g. WZRD"
                  maxLength={12}
                />
                {errors.symbol && (
                  <p className="text-xs text-red-500">{errors.symbol}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="What makes this coin special?"
                />
                {errors.description && (
                  <p className="text-xs text-red-500">{errors.description}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supply">Creator Supply</Label>
                <Input
                  id="supply"
                  inputMode="numeric"
                  value={form.supply.toLocaleString()}
                  onChange={(e) => handleNumber(e.target.value)}
                  placeholder="e.g. 100,000,000"
                />
                {errors.supply && (
                  <p className="text-xs text-red-500">{errors.supply}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  supply = total supply = creator supply.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Logo Image (upload)</Label>
                <ImageInput onChange={handleImageChange} />
                <p className="text-xs text-muted-foreground">
                  PNG/JPG/GIF • Max 5MB
                </p>
              </div>

              {!account && (
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                  <AlertTitle className="text-blue-800 dark:text-blue-200">
                    Wallet required
                  </AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    Please connect your wallet to continue.
                  </AlertDescription>
                </Alert>
              )}

              {writeError && (
                <Alert variant="destructive">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="break-words">
                    {writeError.message}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                disabled={submitting || isPending || !account}
                className="w-full"
              >
                {submitting || isPending ? "Creating…" : "Create Simple Coin"}
              </Button>

              {hash && (
                <Alert className="mt-2">
                  <AlertTitle>Transaction sent</AlertTitle>
                  <AlertDescription className="break-all">
                    {hash}
                  </AlertDescription>
                </Alert>
              )}

              {txSuccess && (
                <Alert className="mt-2">
                  <AlertTitle>Transaction confirmed</AlertTitle>
                  <AlertDescription>
                    {coinId ? (
                      <>
                        Coin ID:{" "}
                        <span className="font-mono">{coinId.toString()}</span>
                      </>
                    ) : (
                      "Your coin was created."
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {txLoading && (
                <Alert className="mt-2">
                  <AlertTitle>Waiting for confirmation…</AlertTitle>
                  <AlertDescription>
                    Hang tight while the transaction is mined.
                  </AlertDescription>
                </Alert>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCoinWizard;
