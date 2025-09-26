// ============================
// RaiseForm.tsx (updated)
// - Adds useETHPrice hook to fetch ETH price in USD
// - Passes ethPriceUSD down to PreviewRaise for initial coin USD price display
// ============================
import React, { useMemo, useRef, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { TemplateCards } from "./TemplateCards";
import { PreviewRaise } from "./PreviewRaise";
import { ImageInput } from "@/components/ui/image-input";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { useETHPrice } from "@/hooks/use-eth-price";
import { FeeOrHookSelector } from "@/components/pools/FeeOrHookSelector";
import { isFeeOrHook } from "@/lib/pools";
import { Link } from "@tanstack/react-router";

// === Form logic ===
export const templates = {
  kickstarter: {
    label: "1) Kickstarter (100% ETH → creator)",
    needsChef: false,
    needsAirdrop: true,
  },
  kickstarter_chef: {
    label: "2) Kickstarter + zChef incentive",
    needsChef: true,
    needsAirdrop: true,
  },
};

const defaultState = {
  template: "kickstarter" as keyof typeof templates,
  name: "",
  symbol: "",
  description: "",
  ethRateDisplay: "1,000,000,000",
  lpBps: 0,
  feeOrHook: 30n,
  totalSupplyDisplay: "1,000,000,000",
  incentiveAmountDisplay: "100,000,000",
  airdropIncentiveDisplay: "50,000,000",
  creatorSupplyDisplay: "0",
  incentiveDurationDays: 30,
  airdropIncentiveId: 87,
  airdropPriceDisplay: "0.01",
  uri: "ipfs://…",
  buyCoinId: "",
  buyEthAmount: "",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xl font-semibold mb-3 mt-2">{children}</div>;
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
  );
}
function Field({
  label,
  description,
  className,
  children,
}: {
  label: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {description ? (
        <div className="text-xs text-muted-foreground leading-snug">
          {description}
        </div>
      ) : null}
    </div>
  );
}

export default function RaiseForm() {
  const { t } = useTranslation();
  const [state, setState] = useState(defaultState);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const { address: creator } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);

  const { data: ethPrice } = useETHPrice();

  // Helper to format number with commas
  const formatWithCommas = (value: string) => {
    // Remove all non-digit and non-decimal characters
    const cleanValue = value.replace(/[^\d.]/g, '');

    // Split into integer and decimal parts
    const parts = cleanValue.split('.');

    // Format integer part with commas
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Join back together
    return parts.join('.');
  };

  // Helper to remove commas for parsing
  const removeCommas = (value: string) => {
    return value.replace(/,/g, '');
  };

  const onChange = (key: keyof typeof defaultState) => (e: any) => {
    let value = e?.target ? e.target.value : e;

    // Apply comma formatting for number display fields
    if (typeof value === 'string' && [
      'ethRateDisplay',
      'totalSupplyDisplay',
      'incentiveAmountDisplay',
      'airdropIncentiveDisplay',
      'creatorSupplyDisplay'
    ].includes(key)) {
      value = formatWithCommas(value);
    }

    setState((s) => ({ ...s, [key]: value }));
  };

  // Map card key → internal template key
  const cardMap: Record<string, keyof typeof templates> = {
    kickstarter: "kickstarter",
    kickstarter_chef: "kickstarter_chef",
  };

  function onSelectCard(key: string) {
    const mapped = cardMap[key] || "kickstarter";
    setState((s) => ({ ...s, template: mapped }));
    // Smooth focus to the form
    setTimeout(
      () =>
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  // ===== Derived values =====
  const totalSupply = useMemo(
    () => parseUnits(safeNum(removeCommas(state.totalSupplyDisplay)), 18),
    [state.totalSupplyDisplay],
  );
  const incentiveAmount = useMemo(
    () => parseUnits(safeNum(removeCommas(state.incentiveAmountDisplay)), 18),
    [state.incentiveAmountDisplay],
  );
  const airdropIncentive = useMemo(
    () => parseUnits(safeNum(removeCommas(state.airdropIncentiveDisplay)), 18),
    [state.airdropIncentiveDisplay],
  );
  const creatorSupply = useMemo(
    () => parseUnits(safeNum(removeCommas(state.creatorSupplyDisplay)), 18),
    [state.creatorSupplyDisplay],
  );
  const ethRate = useMemo(() => {
    const coinsPerEth = BigInt(safeInt(removeCommas(state.ethRateDisplay)));
    return coinsPerEth * BigInt(1e18);
  }, [state.ethRateDisplay]);
  const incentiveDuration = useMemo(
    () => BigInt(state.incentiveDurationDays * 24 * 60 * 60),
    [state.incentiveDurationDays],
  );
  const airdropPriceX18 = useMemo(
    () => parseUnits(safeNum(state.airdropPriceDisplay), 18),
    [state.airdropPriceDisplay],
  );

  const otcSupply = useMemo(() => {
    let res = totalSupply - creatorSupply - airdropIncentive;
    if (templates[state.template].needsChef) res -= incentiveAmount;
    return res;
  }, [
    state.template,
    totalSupply,
    creatorSupply,
    incentiveAmount,
    airdropIncentive,
  ]);

  const canSubmit = useMemo(() => {
    if (!creator || !state.uri) return false;
    if (otcSupply <= 0n) return false;
    if (
      templates[state.template].needsAirdrop &&
      airdropIncentive > 0n &&
      airdropPriceX18 === 0n
    )
      return false;
    return true;
  }, [
    creator,
    state.uri,
    otcSupply,
    state.template,
    airdropIncentive,
    airdropPriceX18,
  ]);

  async function submitCreateSale(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setTxHash(null);

    try {
      if (!state.name || !state.symbol || !state.description) {
        throw new Error(t("raise.form.required_fields_error"));
      }

      if (!creator) throw new Error(t("raise.form.creator_not_found"));

      const metadata: Record<string, unknown> = {
        name: state.name.trim(),
        symbol: state.symbol.trim(),
        description: state.description.trim(),
      };

      if (imageBuffer) {
        const imageUri = await pinImageToPinata(
          imageBuffer,
          `${metadata.name}-logo`,
          {
            keyvalues: {
              coinName: metadata.name,
              coinSymbol: metadata.symbol,
              type: "coin-logo",
            },
          },
        );

        metadata.image = imageUri;
      } else {
        throw new Error(t("ico.error_upload_image"));
      }

      const metadataUri = await pinJsonToPinata(metadata);

      if (state.template === "kickstarter") {
        const hash = await writeContractAsync({
          abi: zICOAbi,
          address: zICOAddress,
          functionName: "createCoinWithOTC",
          args: [
            creator,
            ethRate as unknown as bigint,
            state.lpBps,
            otcSupply,
            creatorSupply,
            0n,
            airdropIncentive,
            BigInt(state.airdropIncentiveId),
            airdropPriceX18,
            metadataUri,
          ],
        });
        setTxHash(hash);
      } else {
        const hash = await writeContractAsync({
          abi: zICOAbi,
          address: zICOAddress,
          functionName: "createCoinWithOTCAndIncentive",
          args: [
            creator,
            ethRate as unknown as bigint,
            state.lpBps,
            otcSupply,
            BigInt(state.feeOrHook),
            creatorSupply,
            0n,
            incentiveAmount,
            incentiveDuration,
            templates[state.template].needsAirdrop ? airdropIncentive : 0n,
            templates[state.template].needsAirdrop
              ? BigInt(state.airdropIncentiveId)
              : 0n,
            templates[state.template].needsAirdrop ? airdropPriceX18 : 0n,
            metadataUri,
          ],
        });
        setTxHash(hash);
      }
    } catch (err: any) {
      console.error(err);

      // Check for user rejection
      if (err?.message?.includes("User rejected") ||
          err?.shortMessage?.includes("User rejected") ||
          err?.cause?.message?.includes("User rejected")) {
        setError(t("common.transaction_rejected") || "Transaction cancelled");
        toast.info(t("common.transaction_rejected") || "Transaction cancelled");
        return;
      }

      // Check for other common wallet errors
      if (err?.message?.includes("User denied") ||
          err?.shortMessage?.includes("User denied")) {
        setError(t("common.transaction_denied") || "Transaction denied");
        toast.info(t("common.transaction_denied") || "Transaction denied");
        return;
      }

      // Default error handling
      const errorMessage = err?.shortMessage || err?.message || "Transaction failed";
      setError(errorMessage);
      toast.error(errorMessage);
    }
  }

  const handleImageFileChange = async (file: File | File[] | undefined) => {
    if (file && !Array.isArray(file)) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t("raise.form.image_too_large"));
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error(
          t("raise.form.invalid_image_type"),
        );
        return;
      }

      const buffer = await file.arrayBuffer();
      setImageBuffer(buffer);
    } else {
      setImageBuffer(null);
    }
  };

  const isHook = useMemo(() => {
    return isFeeOrHook(state.feeOrHook);
  }, [state.feeOrHook]);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">{t("raise.title")}</h1>
        <div className="text-xs md:text-sm text-muted-foreground">
          {t("raise.subtitle")}
        </div>
      </div>

      {/* Template selector cards */}
      <TemplateCards onSelect={onSelectCard} selectedKey={state.template} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PreviewRaise
          imageBuffer={imageBuffer}
          state={state}
          ethRate={ethRate}
          otcSupply={otcSupply}
          incentiveAmount={incentiveAmount}
          incentiveDuration={incentiveDuration}
          ethPriceUSD={ethPrice?.priceUSD ?? null} // <— NEW
        />
        <form onSubmit={submitCreateSale} className="space-y-6">
          <SectionTitle>{t("raise.form.identity_section")}</SectionTitle>
          <Row>
            <Field
              label={t("raise.form.name_label")}
              description={t("raise.form.name_description")}
            >
              <Input
                className="rounded-md"
                value={state.name}
                onChange={onChange("name")}
              />
            </Field>
            <Field label={t("raise.form.symbol_label")} description={t("raise.form.symbol_description")}>
              <Input
                className="rounded-md"
                value={state.symbol}
                onChange={onChange("symbol")}
              />
            </Field>
          </Row>
          <Row>
            <Field
              label={t("raise.form.description_label")}
              description={t("raise.form.description_description")}
              className="col-span-2"
            >
              <Textarea
                className="rounded-md"
                value={state.description}
                onChange={onChange("description")}
              />
            </Field>
          </Row>

          <ImageInput onChange={handleImageFileChange} />
          <SectionTitle>{t("raise.form.tokenomics_section")}</SectionTitle>
          <Row>
            <Field
              label={t("raise.form.eth_rate_label")}
              description={t("raise.form.eth_rate_description")}
            >
              <Input
                value={state.ethRateDisplay}
                onChange={onChange("ethRateDisplay")}
              />
            </Field>
          </Row>

          <SectionTitle>{t("raise.form.supply_section")}</SectionTitle>
          <Row>
            <Field label={t("raise.form.total_supply_label")} description={t("raise.form.total_supply_description")}>
              <Input
                value={state.totalSupplyDisplay}
                onChange={onChange("totalSupplyDisplay")}
              />
            </Field>
            <Field label={t("raise.form.creator_reserve_label")}>
              <Input
                value={state.creatorSupplyDisplay}
                onChange={onChange("creatorSupplyDisplay")}
              />
            </Field>
          </Row>

          {templates[state.template].needsChef && (
            <div>
              <SectionTitle>{t("raise.form.farm_incentives_section")}</SectionTitle>
              <p className="text-sm text-muted-foreground mb-4">
                {t("raise.form.farm_incentives_description")}
              </p>
              <FeeOrHookSelector
                feeOrHook={state.feeOrHook}
                setFeeOrHook={onChange("feeOrHook")}
                isHook={isHook}
                className="mb-2"
              />

              <Row>
                <Field
                  label={t("raise.form.incentive_amount_label")}
                  description={t("raise.form.incentive_amount_description")}
                >
                  <Input
                    value={state.incentiveAmountDisplay}
                    onChange={onChange("incentiveAmountDisplay")}
                  />
                </Field>
                <Field
                  label={t("raise.form.incentive_duration_label")}
                  description={t("raise.form.incentive_duration_description")}
                >
                  <div className="relative">
                    <Input
                      type="number"
                      value={state.incentiveDurationDays}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          incentiveDurationDays: Number(e.target.value || 0),
                        }))
                      }
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      {t("common.days")}
                    </span>
                  </div>
                </Field>
              </Row>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("raise.form.pool_note")}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={!canSubmit || isPending}
              className="w-full px-5"
            >
              {isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("raise.form.confirm_in_wallet")}
                </span>
              ) : (
                t("raise.form.create_sale_button")
              )}
            </Button>
            {txHash && (
              <span className="text-sm">
                {t("raise.form.submitted_tx")}{" "}
                <code className="bg-muted px-2 py-1 rounded">{txHash}</code>
              </span>
            )}
            {receipt && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> {t("raise.form.mined_in_block")}{" "}
                {receipt.blockNumber?.toString?.()}
              </span>
            )}
          </div>
        </form>
      </div>

      <HelpNotes />
    </div>
  );
}

function HelpNotes() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === 'zh';

  return (
    <div className="shadow-none border border-dashed p-5 text-sm space-y-2 leading-relaxed">
      <div className="font-medium">{t("raise.help.notes")}</div>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
        <li>
          {isZh ? (
            <>
              所有创建的代币都有资格参加空投计划，创建代币总供应量的 5% 将以可认领的方式空投给{" "}
              <Link to="/stake" className="text-primary underline hover:no-underline">
                veZAMM 持有者
              </Link>
              。
            </>
          ) : (
            <>
              All created tokens are eligible for the airdrop program, where 5% of the created token total supply
              will be claimably airdropped to{" "}
              <Link to="/stake" className="text-primary underline hover:no-underline">
                veZAMM holders
              </Link>
              .
            </>
          )}
        </li>
      </ul>
    </div>
  );
}

// --- helpers ---
function safeNum(v: string) {
  const x = (v || "").trim();
  if (!x) return "0";
  return x;
}
function safeInt(v: string) {
  const x = (v || "").trim();
  if (!x) return "0";
  return x.replace(/\..*$/, "");
}
