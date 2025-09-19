import React, { useState } from "react";
import { z } from "zod";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseEther, parseUnits, zeroAddress, Address } from "viem";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";

import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { ICOLivePreview } from "./ICOLivePreview";
import { Heading } from "../ui/typography";

export type ICOForm = {
  name: string;
  symbol: string;
  description: string;
  feeOrHook: number;
  incentiveDuration: number; // in days
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  symbol: z
    .string()
    .trim()
    .min(1, "Symbol is required")
    .max(12, "Max 12 characters")
    .regex(/^[A-Za-z0-9_$.-]+$/, "Use A–Z, a–z, 0–9, _ $ . -"),
  description: z.string().trim().max(1000).optional().default(""),
  feeOrHook: z
    .number({ invalid_type_error: "Enter a number" })
    .min(1, "Must be at least 1 bps")
    .max(10000, "Max 10000 bps (100%)"),
  incentiveDuration: z
    .number({ invalid_type_error: "Enter a number" })
    .positive("Must be greater than 0")
    .max(365, "Max 365 days"),
});

// Constants for the LP-mined ICO
const DUST_ETH = parseEther("0.001");
const POOL_SUPPLY = parseUnits("1000000", 18); // 0.1% (1,000,000 coins)
const INCENTIVE_AMOUNT = parseUnits("900000000", 18); // 90%
const AIRDROP_INCENTIVE = parseUnits("99000000", 18); // 9.9%
const AIRDROP_INCENTIVE_ID = 87n;
const AIRDROP_PRICE_X18 = 10n ** 14n; // 1e14 = 10,000 new / 1 veZAMM (87)
const CREATOR_SUPPLY = 0n; // No creator allocation
const CREATOR_UNLOCK = 0n;

export const CreateICOWizard: React.FC = () => {
  const { t } = useTranslation();
  const { address: account } = useAccount();
  const publicClient = usePublicClient();

  const {
    writeContractAsync,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txLoading } =
    useWaitForTransactionReceipt({ hash });

  const [form, setForm] = useState<ICOForm>({
    name: "",
    symbol: "",
    description: "",
    feeOrHook: 30, // 30 bps (0.3%) default
    incentiveDuration: 14, // 14 days default
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [coinId, setCoinId] = useState<bigint | null>(null);
  const [chefId, setChefId] = useState<bigint | null>(null);

  // Advanced settings toggles
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleNumber =
    (field: "feeOrHook" | "incentiveDuration") => (raw: string) => {
      const value = raw.replace(/,/g, "");
      const n = Number(value);
      setForm((p) => ({
        ...p,
        [field]: Number.isFinite(n) ? Math.floor(n) : 0,
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
    if (!publicClient) return;
    const parsed = validate();
    if (!parsed) {
      toast.error(t("common.error_fix_form"));
      return;
    }
    if (!account) {
      toast.error(t("common.error_connect_wallet"));
      return;
    }
    if (!imageBuffer) {
      toast.error(t("ico.error_upload_image"));
      return;
    }

    try {
      setSubmitting(true);
      toast.info(t("ico.preparing_ico"));

      // 1) Pin image
      const imgUri = await pinImageToPinata(
        imageBuffer,
        `${parsed.name}-logo`,
        {
          keyvalues: {
            coinName: parsed.name,
            coinSymbol: parsed.symbol,
            type: "ico-logo",
          },
        },
      );

      // 2) Pin metadata JSON
      const metadata = {
        name: parsed.name,
        symbol: parsed.symbol,
        description: parsed.description || undefined,
        image: imgUri,
        properties: {
          type: "LP-mined ICO",
          airdrop: "veZAMM (87)",
          lpMining: true,
        },
      };
      const tokenUri = await pinJsonToPinata(metadata);

      // Calculate incentive duration in seconds
      const incentiveDurationSeconds = parsed.incentiveDuration * 24 * 60 * 60;

      // Prepare parameters for createCoinWithPool
      const params = {
        lpLock: false,
        creator: account as Address,
        tokenIn: zeroAddress, // ETH path
        tokenId: 0n,
        amountIn: 0n,
        feeOrHook: BigInt(parsed.feeOrHook),
        poolSupply: POOL_SUPPLY,
        creatorSupply: CREATOR_SUPPLY,
        creatorUnlock: CREATOR_UNLOCK,
        incentiveAmount: INCENTIVE_AMOUNT,
        incentiveDuration: BigInt(incentiveDurationSeconds),
        airdropIncentive: AIRDROP_INCENTIVE,
        airdropIncentiveId: AIRDROP_INCENTIVE_ID,
        airdropPriceX18: AIRDROP_PRICE_X18,
        uri: tokenUri,
      };

      // Try to simulate for predicted IDs
      try {
        const sim = await publicClient.simulateContract({
          abi: zICOAbi,
          address: zICOAddress as `0x${string}`,
          functionName: "createCoinWithPool",
          args: [
            params.lpLock,
            params.creator,
            params.tokenIn,
            params.tokenId,
            params.amountIn,
            params.feeOrHook,
            params.poolSupply,
            params.creatorSupply,
            params.creatorUnlock,
            params.incentiveAmount,
            params.incentiveDuration,
            params.airdropIncentive,
            params.airdropIncentiveId,
            params.airdropPriceX18,
            params.uri,
          ],
          account,
          value: DUST_ETH,
        });

        // Parse result (could be tuple or object)
        const res: any = sim.result as any;
        if (Array.isArray(res)) {
          const [predictedCoinId, , predictedChefId] = res;
          setCoinId(predictedCoinId as bigint);
          setChefId(predictedChefId as bigint);
        } else {
          setCoinId(res?.coinId as bigint);
          setChefId(res?.chefId as bigint);
        }
      } catch (simError) {
        console.warn("Simulation failed, continuing anyway:", simError);
      }

      // Send transaction
      await writeContractAsync({
        abi: zICOAbi,
        address: zICOAddress as `0x${string}`,
        functionName: "createCoinWithPool",
        args: [
          params.lpLock,
          params.creator,
          params.tokenIn,
          params.tokenId,
          params.amountIn,
          params.feeOrHook,
          params.poolSupply,
          params.creatorSupply,
          params.creatorUnlock,
          params.incentiveAmount,
          params.incentiveDuration,
          params.airdropIncentive,
          params.airdropIncentiveId,
          params.airdropPriceX18,
          params.uri,
        ],
        value: DUST_ETH,
      });

      toast.success(t("ico.transaction_submitted"));
      setSubmitting(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to create LP-mined ICO");
      setSubmitting(false);
    }
  };

  const buttonLabel =
    submitting || isPending ? t("ico.launching") : t("ico.launch_button");

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Live Preview */}
        <ICOLivePreview
          form={form}
          imagePreviewUrl={imagePreviewUrl}
          coinId={coinId?.toString()}
          chefId={chefId?.toString()}
        />

        {/* Form */}
        <div>
          <div className="mb-4">
            <Heading level={3}>{t("ico.title")}</Heading>
            <p className="text-sm text-secondary-foreground mt-2">
              {
                t("ico.description", { days: form.incentiveDuration }).split(
                  "veZAMM (87)",
                )[0]
              }
              <Link
                to="/c/$coinId"
                params={{ coinId: "87" }}
                className="text-primary underline hover:no-underline"
              >
                veZAMM (87)
              </Link>
              {
                t("ico.description", { days: form.incentiveDuration })
                  .split("veZAMM (87)")[1]
                  .split("zChef")[0]
              }
              <Link
                to="/farm"
                className="text-primary underline hover:no-underline"
              >
                zChef
              </Link>
              {
                t("ico.description", { days: form.incentiveDuration })
                  .split("veZAMM (87)")[1]
                  .split("zChef")[1]
              }
            </p>
            <Link
              to="/create"
              className="text-sm text-primary underline hover:no-underline"
            >
              {t("ico.prefer_traditional")}
            </Link>
          </div>

          <div>
            <div className="space-y-4">
              {/* Base token details */}
              <div className="grid gap-2">
                <Label htmlFor="name">{t("ico.token_name")}</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder={t("ico.token_name_placeholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ico.token_name_hint")}
                </p>
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="symbol">{t("ico.token_symbol")}</Label>
                <Input
                  id="symbol"
                  value={form.symbol}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, symbol: e.target.value }))
                  }
                  placeholder={t("ico.token_symbol_placeholder")}
                  maxLength={12}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ico.token_symbol_hint")}
                </p>
                {errors.symbol && (
                  <p className="text-xs text-red-500">{errors.symbol}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">
                  {t("ico.token_description")}
                </Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder={t("ico.token_description_placeholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("ico.token_description_hint")}
                </p>
                {errors.description && (
                  <p className="text-xs text-red-500">{errors.description}</p>
                )}
              </div>

              <div className="grid gap-2">
                <Label>{t("ico.token_logo")}</Label>
                <ImageInput onChange={handleImageChange} />
                <p className="text-xs text-muted-foreground">
                  {t("ico.logo_hint")}
                </p>
              </div>

              {/* Advanced Settings Toggle */}
              <div className="pt-2 flex items-center space-x-2">
                <Switch
                  id="advanced"
                  checked={showAdvanced}
                  onCheckedChange={setShowAdvanced}
                />
                <Label htmlFor="advanced" className="cursor-pointer">
                  {t("ico.advanced_settings")}
                </Label>
              </div>

              {/* Advanced Settings */}
              {showAdvanced && (
                <div className="space-y-4 p-4 border border-border rounded-md bg-muted/50">
                  <div className="grid gap-2">
                    <Label htmlFor="feeOrHook">{t("ico.swap_fee")}</Label>
                    <Input
                      id="feeOrHook"
                      inputMode="numeric"
                      value={form.feeOrHook}
                      onChange={(e) =>
                        handleNumber("feeOrHook")(e.target.value)
                      }
                      placeholder="30"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("ico.swap_fee_hint")}
                    </p>
                    {errors.feeOrHook && (
                      <p className="text-xs text-red-500">{errors.feeOrHook}</p>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="incentiveDuration">
                      {t("ico.incentive_duration", {
                        days: form.incentiveDuration,
                      })}
                    </Label>
                    <Slider
                      id="incentiveDuration"
                      min={7}
                      max={30}
                      step={1}
                      value={[form.incentiveDuration]}
                      onValueChange={(value) =>
                        setForm((p) => ({ ...p, incentiveDuration: value[0] }))
                      }
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("ico.incentive_duration_hint")}
                    </p>
                    {errors.incentiveDuration && (
                      <p className="text-xs text-red-500">
                        {errors.incentiveDuration}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Fixed Parameters Info */}
              <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                <AlertTitle className="text-blue-800 dark:text-blue-200">
                  ICO Parameters
                </AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-300 space-y-1">
                  <p>• {t("ico.total_supply_fixed")}</p>
                  <p>• {t("ico.initial_pool")}</p>
                  <p>
                    •{" "}
                    {
                      t("ico.lp_mining", {
                        days: form.incentiveDuration,
                      }).split("zChef")[0]
                    }
                    <Link
                      to="/farm"
                      className="text-primary underline hover:no-underline"
                    >
                      zChef
                    </Link>
                    {t("ico.lp_mining", { days: form.incentiveDuration }).split(
                      "zChef",
                    )[1] || ""}
                  </p>
                  <p>
                    • {t("ico.community_airdrop").split("veZAMM (87)")[0]}
                    <Link
                      to="/c/$coinId"
                      params={{ coinId: "87" }}
                      className="text-primary underline hover:no-underline"
                    >
                      veZAMM (87)
                    </Link>
                    {t("ico.community_airdrop").split("veZAMM (87)")[1]}
                  </p>
                  <p>• {t("ico.creator_allocation")}</p>
                </AlertDescription>
              </Alert>

              {!account && (
                <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950">
                  <AlertTitle className="text-yellow-800 dark:text-yellow-200">
                    {t("common.wallet_required")}
                  </AlertTitle>
                  <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                    {t("ico.connect_wallet_to_launch")}
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
                {buttonLabel}
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
                <Alert className="mt-2 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
                  <AlertTitle className="text-green-800 dark:text-green-200">
                    ICO Launched Successfully!
                  </AlertTitle>
                  <AlertDescription className="space-y-2">
                    <div className="flex gap-2 flex-wrap">
                      {coinId !== null && (
                        <Link
                          to={"/c/$coinId"}
                          params={{ coinId: coinId.toString() }}
                          className="inline-flex items-center px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                        >
                          View Coin #{coinId.toString()}
                        </Link>
                      )}
                      {chefId !== null && (
                        <Link
                          to={"/farm"}
                          className="inline-flex items-center px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                        >
                          Open Staking (zChef #{chefId.toString()})
                        </Link>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => {
                          const shareUrl = `${window.location.origin}/c/${coinId?.toString() || ""}`;
                          navigator.clipboard.writeText(shareUrl);
                          toast.success(t("ico.share_copied"));
                        }}
                      >
                        {t("ico.share")}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {txLoading && (
                <Alert className="mt-2">
                  <AlertTitle>{t("ico.waiting_confirmation")}</AlertTitle>
                  <AlertDescription>{t("ico.ico_deploying")}</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateICOWizard;
