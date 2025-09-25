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
  ethRateDisplay: "1000000000",
  lpBps: 0,
  feeOrHook: 30n,
  totalSupplyDisplay: "1000000000",
  incentiveAmountDisplay: "100000000",
  airdropIncentiveDisplay: "50000000",
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

  const onChange = (key: keyof typeof defaultState) => (e: any) => {
    setState((s) => ({ ...s, [key]: e?.target ? e.target.value : e }));
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
    () => parseUnits(safeNum(state.totalSupplyDisplay), 18),
    [state.totalSupplyDisplay],
  );
  const incentiveAmount = useMemo(
    () => parseUnits(safeNum(state.incentiveAmountDisplay), 18),
    [state.incentiveAmountDisplay],
  );
  const airdropIncentive = useMemo(
    () => parseUnits(safeNum(state.airdropIncentiveDisplay), 18),
    [state.airdropIncentiveDisplay],
  );
  const creatorSupply = useMemo(
    () => parseUnits(safeNum(state.creatorSupplyDisplay), 18),
    [state.creatorSupplyDisplay],
  );
  const ethRate = useMemo(() => {
    const coinsPerEth = BigInt(safeInt(state.ethRateDisplay));
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
    let res = totalSupply - creatorSupply;
    if (templates[state.template].needsChef) res -= incentiveAmount;
    if (templates[state.template].needsAirdrop) res -= airdropIncentive;
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
        throw new Error("Please fill in all required fields.");
      }

      if (!creator) throw new Error("Creator not found. Connect your wallet.");

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
        throw new Error("Please upload an image.");
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
            0n,
            0n,
            0n,
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
      setError(err?.shortMessage || err?.message || "Transaction failed");
      toast.error(err?.shortMessage || err?.message || "Transaction failed");
    }
  }

  const handleImageFileChange = async (file: File | File[] | undefined) => {
    if (file && !Array.isArray(file)) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(t("create.image_too_large", "Image must be less than 5MB"));
        return;
      }

      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error(
          t("create.invalid_image_type", "Please upload an image file"),
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
        <h1 className="text-2xl md:text-3xl font-bold">Raise now</h1>
        <div className="text-xs md:text-sm text-muted-foreground">
          Raise funds onchain for <i>any</i> goal.
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
          airdropIncentive={airdropIncentive}
          airdropPriceX18={airdropPriceX18}
          incentiveDuration={incentiveDuration}
          ethPriceUSD={ethPrice?.priceUSD ?? null} // <— NEW
        />
        <form onSubmit={submitCreateSale} className="space-y-6">
          <SectionTitle>Identity</SectionTitle>
          <Row>
            <Field
              label="Name"
              description="e.g. My Very Descriptive Project Name"
            >
              <Input
                className="rounded-md"
                value={state.name}
                onChange={onChange("name")}
              />
            </Field>
            <Field label="Symbol" description="e.g. MYVDPN">
              <Input
                className="rounded-md"
                value={state.symbol}
                onChange={onChange("symbol")}
              />
            </Field>
          </Row>
          <Row>
            <Field
              label="Description"
              description="e.g. Super In-depth Project Description"
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
          <SectionTitle>Tokenomics</SectionTitle>
          <Row>
            <Field
              label="ETH rate (coins per 1 ETH)"
              description="Example: 1000000000 → 1e9 coins per ETH"
            >
              <Input
                value={state.ethRateDisplay}
                onChange={onChange("ethRateDisplay")}
              />
            </Field>
          </Row>

          <SectionTitle>Supply</SectionTitle>
          <Row>
            <Field label="Total supply" description="Assumes 18 decimals">
              <Input
                value={state.totalSupplyDisplay}
                onChange={onChange("totalSupplyDisplay")}
              />
            </Field>
            <Field label="Creator reserve">
              <Input
                value={state.creatorSupplyDisplay}
                onChange={onChange("creatorSupplyDisplay")}
              />
            </Field>
          </Row>

          {templates[state.template].needsChef && (
            <div>
              <SectionTitle>Farm Incentives</SectionTitle>
              <FeeOrHookSelector
                feeOrHook={state.feeOrHook}
                setFeeOrHook={onChange("feeOrHook")}
                isHook={isHook}
                className="mb-2"
              />

              <Row>
                <Field
                  label="Incentive amount"
                  description="The amount to be streamed."
                >
                  <Input
                    value={state.incentiveAmountDisplay}
                    onChange={onChange("incentiveAmountDisplay")}
                  />
                </Field>
                <Field
                  label="Incentive duration"
                  description="The duration of the incentive period."
                >
                  <Input
                    type="number"
                    value={state.incentiveDurationDays}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        incentiveDurationDays: Number(e.target.value || 0),
                      }))
                    }
                  />
                </Field>
              </Row>
              <p className="mt-2 text-xs text-muted-foreground">
                The pool can be initialized later by anyone.
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
                  <Loader2 className="h-4 w-4 animate-spin" /> Confirm in
                  wallet…
                </span>
              ) : (
                "Create Sale"
              )}
            </Button>
            {txHash && (
              <span className="text-sm">
                Submitted tx:{" "}
                <code className="bg-muted px-2 py-1 rounded">{txHash}</code>
              </span>
            )}
            {receipt && (
              <span className="inline-flex items-center gap-1 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" /> Mined in block{" "}
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
  return (
    <div className="shadow-none border border-dashed p-5 text-sm space-y-2 leading-relaxed">
      <div className="font-medium">Notes</div>
      <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
        <li>
          All created coins are eligible under the airdrop program, 5% of the
          total supply of the created coin will be airdropped to veZAMM holders
          on a claimable basis.
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
