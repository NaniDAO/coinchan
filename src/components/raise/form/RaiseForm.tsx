import React, { useMemo, useRef, useState } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { parseUnits } from "viem";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

/**
 * RaiseForm + TemplateCards (videos)
 * -------------------------------------------------------
 * - Top row: dynamic template cards using your /templates/*.mp4 files
 * - Selecting a card updates the form's template preset
 * - Form creates the sale via zICO, plus a small OTC buy tester
 */

// === Template selector cards (videos) ===
const videoTemplates = [
  {
    key: "kickstarter",
    title: "Kickstarter (100% ETH → Creator)",
    video: "/templates/kickstarter.mp4",
  },
  {
    key: "kickstarter-zchef",
    title: "Kickstarter + zChef Incentive",
    video: "/templates/kickstarter-zchef.mp4",
  },
  {
    key: "kickstarter-zchef-airdrop",
    title: "Kickstarter + zChef + Airdrop",
    video: "/templates/kickstarter-zchef-airdrop.mp4",
  },
] as const;

function TemplateCards({ onSelect }: { onSelect?: (key: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {videoTemplates.map((tpl) => (
        <motion.div
          key={tpl.key}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect?.(tpl.key)}
        >
          <div className="relative overflow-hidden rounded-md shadow-lg cursor-pointer group border-0">
            <video
              src={tpl.video}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-64 object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <h3 className="text-white font-semibold text-lg drop-shadow-md">
                {tpl.title}
              </h3>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// === Form logic ===
const templates = {
  kickstarter: {
    label: "1) Kickstarter (100% ETH → creator)",
    needsChef: false,
    needsAirdrop: false,
  },
  kickstarter_chef: {
    label: "2) Kickstarter + zChef incentive",
    needsChef: true,
    needsAirdrop: false,
  },
  kickstarter_chef_airdrop: {
    label: "3) Kickstarter + zChef + airdrop",
    needsChef: true,
    needsAirdrop: true,
  },
};

const defaultState = {
  template: "kickstarter" as keyof typeof templates,
  ethRateDisplay: "1000000000",
  lpBps: 0,
  feeOrHook: 3000,
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
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
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
  const [state, setState] = useState(defaultState);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);

  const { address: creator } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash ?? undefined,
  });

  const onChange = (key: keyof typeof defaultState) => (e: any) => {
    setState((s) => ({ ...s, [key]: e?.target ? e.target.value : e }));
  };

  // Map card key → internal template key
  const cardMap: Record<string, keyof typeof templates> = {
    kickstarter: "kickstarter",
    "kickstarter-zchef": "kickstarter_chef",
    "kickstarter-zchef-airdrop": "kickstarter_chef_airdrop",
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
      if (!creator) throw new Error("Creator not found. Connect your wallet.");
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
            state.uri,
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
            state.uri,
          ],
        });
        setTxHash(hash);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.shortMessage || err?.message || "Transaction failed");
    }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Raise now</h1>
        <div className="text-xs md:text-sm text-muted-foreground">
          Raise funds onchain for <i>any</i> goal.
        </div>
      </div>

      {/* Template selector cards */}
      <TemplateCards onSelect={onSelectCard} />

      <Card ref={formRef} className="shadow-sm">
        <CardContent className="space-y-6">
          <form onSubmit={submitCreateSale} className="space-y-6">
            <SectionTitle>Core</SectionTitle>
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

            <Row>
              <Field
                label="lpBps"
                description="0 → buyers do NOT mint LP; 100% ETH to creator"
              >
                <Input
                  type="number"
                  value={state.lpBps}
                  onChange={onChange("lpBps")}
                />
              </Field>
              {templates[state.template].needsChef && (
                <Field
                  label="feeOrHook"
                  description="Pool fee/hook (used when LP exists)"
                >
                  <Input
                    type="number"
                    value={state.feeOrHook}
                    onChange={onChange("feeOrHook")}
                  />
                </Field>
              )}
            </Row>

            <SectionTitle>Supply</SectionTitle>
            <Row>
              <Field
                label="Total supply (whole tokens)"
                description="Assumes 18 decimals; we scale ×1e18"
              >
                <Input
                  value={state.totalSupplyDisplay}
                  onChange={onChange("totalSupplyDisplay")}
                />
              </Field>
              <Field label="Creator reserve (whole tokens)">
                <Input
                  value={state.creatorSupplyDisplay}
                  onChange={onChange("creatorSupplyDisplay")}
                />
              </Field>
            </Row>

            {templates[state.template].needsChef && (
              <Row>
                <Field
                  label="Incentive amount (whole tokens)"
                  description="Streamed by zChef"
                >
                  <Input
                    value={state.incentiveAmountDisplay}
                    onChange={onChange("incentiveAmountDisplay")}
                  />
                </Field>
                <Field label="Incentive duration (days)">
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
            )}

            {templates[state.template].needsAirdrop && (
              <>
                <SectionTitle>Airdrop</SectionTitle>
                <Row>
                  <Field label="Airdrop incentive (whole tokens)">
                    <Input
                      value={state.airdropIncentiveDisplay}
                      onChange={onChange("airdropIncentiveDisplay")}
                    />
                  </Field>
                  <Field label="Airdrop incentive ID">
                    <Input
                      type="number"
                      value={state.airdropIncentiveId}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          airdropIncentiveId: Number(e.target.value || 0),
                        }))
                      }
                    />
                  </Field>
                </Row>
                <Row>
                  <Field
                    label="Airdrop price (Z per coin)"
                    description="Must be > 0. We convert to priceX18"
                  >
                    <Input
                      value={state.airdropPriceDisplay}
                      onChange={onChange("airdropPriceDisplay")}
                    />
                  </Field>
                </Row>
              </>
            )}

            <SectionTitle>Metadata</SectionTitle>
            <Field
              label="Token URI (ipfs://…)"
              description="Metadata URI for the coin"
            >
              <Input
                value={state.uri}
                onChange={onChange("uri")}
                placeholder="ipfs://…"
              />
            </Field>

            <SectionTitle>Derived / Preview</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <InfoPill title="ethRate (×1e18)" value={ethRate.toString()} />
              <InfoPill title="otcSupply (wei)" value={otcSupply.toString()} />
              {templates[state.template].needsChef && (
                <InfoPill
                  title="incentiveAmount (wei)"
                  value={incentiveAmount.toString()}
                />
              )}
              {templates[state.template].needsAirdrop && (
                <>
                  <InfoPill
                    title="airdropIncentive (wei)"
                    value={airdropIncentive.toString()}
                  />
                  <InfoPill
                    title="airdropPriceX18"
                    value={airdropPriceX18.toString()}
                  />
                </>
              )}
              {templates[state.template].needsChef && (
                <InfoPill
                  title="incentiveDuration (sec)"
                  value={incentiveDuration.toString()}
                />
              )}
            </div>

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
                className="rounded-2xl px-5"
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
        </CardContent>
      </Card>

      <HelpNotes />
    </div>
  );
}

function InfoPill({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-muted/60 border text-xs flex flex-col">
      <div className="text-muted-foreground">{title}</div>
      <div className="font-mono break-all">{value}</div>
    </div>
  );
}

function HelpNotes() {
  return (
    <Card className="shadow-none border-dashed">
      <CardContent className="p-5 text-sm space-y-2 leading-relaxed">
        <div className="font-medium">Notes</div>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          <li>
            All supplies assume 18 decimals; the form scales your whole-token
            inputs by 1e18.
          </li>
          <li>
            For template (2) and (3), <code>feeOrHook</code> is stored and used
            only when an LP is created for the coin.
          </li>
          <li>
            For template (3), when <code>airdropIncentive</code> &gt; 0,{" "}
            <code>airdropPriceX18</code> must be &gt; 0.
          </li>
          <li>
            <code>lpBps</code> is set to 0 in these Kickstarter presets so
            buyers do not mint LP and 100% of ETH goes to the creator.
          </li>
          <li>
            Returned <code>coinId</code>/<code>chefId</code> are not available
            from the tx hash alone. To fetch them, read emitted events/logs or
            query the contract after mining.
          </li>
        </ul>
      </CardContent>
    </Card>
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
