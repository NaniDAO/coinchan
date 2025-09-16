import React, { useCallback, useMemo, useState } from "react";
import { z } from "zod";
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt, useWalletClient } from "wagmi";
import { erc20Abi, parseEther, parseUnits, zeroAddress } from "viem";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";

import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { LivePreview } from "./LivePreview";
import { Heading } from "../ui/typography";
import { useLiveCoinId } from "@/hooks/use-live-coin-id";
import { Link } from "@tanstack/react-router";
import { AddPoolForm } from "./AddPoolForm";
import { ETH_TOKEN, isFeeOrHook, TokenMetadata } from "@/lib/pools";
import { SWAP_FEE } from "@/lib/swap";
import { erc6909Abi } from "zrouter-sdk";

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
    .regex(/^[A-Za-z0-9_$.-]+$/, "Use A–Z, a–z, 0–9, _ $ . -"),
  description: z.string().trim().max(1000).optional().default(""),
  supply: z
    .number({ invalid_type_error: "Enter a number" })
    .int("Whole tokens only")
    .positive("Must be greater than 0")
    .max(10_000_000_000, "Too large"),
});

export const CreateCoinWizard: React.FC = () => {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const { writeContractAsync, data: hash, isPending, error: writeError } = useWriteContract();
  const { isSuccess: txSuccess, isLoading: txLoading } = useWaitForTransactionReceipt({ hash });

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

  // ---------- "Add a pool" (optional) ----------
  const [addPoolOpen, setAddPoolOpen] = useState(false);
  const [tokenIn, setTokenIn] = useState<TokenMetadata>(ETH_TOKEN);
  const [amountInText, setAmountInText] = useState<string>("1"); // deposit amount
  const [feeOrHook, setFeeOrHook] = useState<bigint>(SWAP_FEE);
  const [poolPct, setPoolPct] = useState<number>(50); // % of minted supply sent to pool

  const poolSupplyTokens = useMemo(() => {
    const pct = Math.max(0, Math.min(100, Math.floor(poolPct)));
    return Math.floor((form.supply * pct) / 100);
  }, [form.supply, poolPct]);

  const creatorSupplyTokens = useMemo(
    () => Math.max(0, form.supply - poolSupplyTokens),
    [form.supply, poolSupplyTokens],
  );

  const isHook = useMemo(() => {
    return isFeeOrHook(feeOrHook);
  }, [feeOrHook]);

  const userToken: TokenMetadata = useMemo(() => {
    const balance = BigInt(Math.max(0, form.supply - poolSupplyTokens - creatorSupplyTokens));
    return {
      address: CookbookAddress,
      id: liveCoinId ? liveCoinId : 0n,
      name: form.name,
      symbol: form.symbol,
      description: form.description,
      decimals: 18,
      imageUrl: imagePreviewUrl,
      standard: "ERC6909",
      balance,
    };
  }, [liveCoinId, form.name, form.symbol, form.description, form.supply, imagePreviewUrl, poolPct]);

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

  // ---------- Helpers for approvals ----------
  const ensureApprovalIfNeeded = async (amountIn: bigint) => {
    if (!publicClient || !walletClient || !account) return;

    if (tokenIn.address === zeroAddress && tokenIn.id === 0n) return; // no approval for native

    if (tokenIn.standard === "ERC20") {
      const allowance = (await publicClient.readContract({
        abi: erc20Abi,
        address: tokenIn.address as `0x${string}`,
        functionName: "allowance",
        args: [account, zICOAddress as `0x${string}`],
      })) as bigint;

      if (allowance >= amountIn) return;

      toast.info(`Approving ${tokenIn.symbol}…`);
      const approveHash = await walletClient.writeContract({
        abi: erc20Abi,
        address: tokenIn.address as `0x${string}`,
        functionName: "approve",
        args: [zICOAddress as `0x${string}`, amountIn],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      toast.success("Approval confirmed");
      return;
    }

    if (tokenIn.standard === "ERC6909") {
      const id = BigInt(tokenIn.id || "0");
      const isOperator = (await publicClient.readContract({
        abi: erc6909Abi,
        address: tokenIn.address as `0x${string}`,
        functionName: "isOperator",
        args: [account, zICOAddress],
      })) as boolean;

      if (isOperator) return;

      toast.info(`Approving ID ${id.toString()}…`);
      const approveHash = await walletClient.writeContract({
        abi: erc6909Abi,
        address: tokenIn.address as `0x${string}`,
        functionName: "setOperator",
        args: [zICOAddress, true],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
      toast.success("Approval confirmed");
      return;
    }
  };

  // ---------- Submit ----------
  const onSubmit = async () => {
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
      toast.info("Preparing your token…");

      // 1) Pin image
      const imgUri = await pinImageToPinata(imageBuffer, `${parsed.name}-logo`, {
        keyvalues: {
          coinName: parsed.name,
          coinSymbol: parsed.symbol,
          type: "coin-logo",
        },
      });

      // 2) Pin metadata JSON
      const metadata = {
        name: parsed.name,
        symbol: parsed.symbol,
        description: parsed.description || undefined,
        image: imgUri,
      };
      const tokenUri = await pinJsonToPinata(metadata);

      // Branch: simple coin OR coin with pool
      if (!addPoolOpen) {
        const sim = await publicClient.simulateContract({
          abi: CookbookAbi as any,
          address: CookbookAddress as `0x${string}`,
          functionName: "coin",
          args: [account, parseEther(parsed.supply.toString()), tokenUri],
          account,
        });
        const predictedCoinId = sim.result as unknown as bigint;
        setCoinId(predictedCoinId);

        writeContractAsync({
          abi: CookbookAbi as any,
          address: CookbookAddress as `0x${string}`,
          functionName: "coin",
          args: [account, parseEther(parsed.supply.toString()), tokenUri],
        });

        toast.success("Transaction submitted");
        return;
      }

      if (feeOrHook <= 0n) {
        toast.error("Enter a valid fee (bps) or hook ID");
        setSubmitting(false);
        return;
      }

      // Pool & creator allocations (18 decimals)
      const poolSupply = parseEther(poolSupplyTokens.toString());
      const creatorSupply = parseEther(creatorSupplyTokens.toString());

      // amountIn parsing
      let amountIn: bigint = parseUnits((amountInText || "0").trim(), tokenIn.decimals);

      if (amountIn <= 0n) {
        toast.error("Enter a valid positive deposit amount");
        setSubmitting(false);
        return;
      }

      const isETH = tokenIn.address === zeroAddress && tokenIn.id === 0n;

      if (!isETH) {
        // Ensure approvals if needed
        await ensureApprovalIfNeeded(amountIn);
      }

      // (Optional) simulate for UX (coinId, lp)
      try {
        const sim = await publicClient.simulateContract({
          abi: zICOAbi as any,
          address: zICOAddress as `0x${string}`,
          functionName: "createCoinWithPoolSimple",
          args: [
            tokenIn.address ?? zeroAddress,
            tokenIn.id ?? 0n,
            amountIn,
            feeOrHook,
            poolSupply,
            creatorSupply,
            tokenUri,
          ],
          account,
          value: isETH ? amountIn : 0n,
        });
        // viem packs return tuple; accept either [coinId, lp] or object
        const res: any = sim.result as any;
        const predictedCoinId: bigint =
          Array.isArray(res) && res.length >= 1 ? (res[0] as bigint) : (res?.coinId as bigint);
        if (predictedCoinId) setCoinId(predictedCoinId);
      } catch {
        // simulate might revert if external state required — continue anyway
      }

      // Send tx
      await writeContractAsync({
        abi: zICOAbi as any,
        address: zICOAddress as `0x${string}`,
        functionName: "createCoinWithPoolSimple",
        args: [
          tokenIn.address ?? zeroAddress,
          tokenIn.id ?? 0n,
          amountIn,
          feeOrHook,
          poolSupply,
          creatorSupply,
          tokenUri,
        ],
        value: isETH ? amountIn : undefined,
      });

      toast.success("Transaction submitted");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Failed to create token");
      setSubmitting(false);
    }
  };

  const onSelectTokenA = useCallback((token: TokenMetadata) => {
    setTokenIn(token);
  }, []);

  const buttonLabel =
    addPoolOpen && !submitting && !isPending
      ? "Create Token with Pool"
      : submitting || isPending
        ? "Creating…"
        : "Create Token";

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Big Live Preview */}
        <LivePreview
          coinId={liveCoinId?.toString()}
          form={form}
          imagePreviewUrl={imagePreviewUrl}
          poolPct={poolPct}
          poolSupplyTokens={poolSupplyTokens}
          creatorSupplyTokens={creatorSupplyTokens}
          tokenIn={tokenIn}
          amountInText={amountInText}
          feeOrHook={feeOrHook}
          isHook={isHook}
        />

        {/* Form */}
        <div>
          <div className="mb-4">
            <Heading level={3}>Create Token</Heading>
            <p className="text-sm text-secondary-foreground">Set your token details, then deploy.</p>
          </div>

          <div>
            <div className="space-y-4">
              {/* -------- Base token details -------- */}
              <div className="grid gap-2">
                <Label htmlFor="name">Token name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. ZAMM"
                />
                <p className="text-xs text-muted-foreground">Human-readable name shown in wallets and explorers.</p>
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="symbol">Token symbol (ticker)</Label>
                <Input
                  id="symbol"
                  value={form.symbol}
                  onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))}
                  placeholder="e.g. ZAMM"
                  maxLength={12}
                />
                <p className="text-xs text-muted-foreground">Up to 12 characters. {`Use A–Z, a–z, 0–9, _ $ . -`}</p>
                {errors.symbol && <p className="text-xs text-red-500">{errors.symbol}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Token description</Label>
                <Textarea
                  id="description"
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="optional — what’s this coin for?"
                />
                <p className="text-xs text-muted-foreground">Shown in marketplaces and explorers (optional).</p>
                {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="supply">Total supply</Label>
                <Input
                  id="supply"
                  inputMode="numeric"
                  value={form.supply.toLocaleString()}
                  onChange={(e) => handleNumber(e.target.value)}
                  placeholder="e.g. 100,000,000"
                />
                {errors.supply && <p className="text-xs text-red-500">{errors.supply}</p>}
                <p className="text-xs text-muted-foreground">
                  Initial total supply (whole tokens). Minted to your address on create.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Token logo</Label>
                <ImageInput onChange={handleImageChange} />
                <p className="text-xs text-muted-foreground">PNG/JPG/GIF • Max 5MB • Square 256×256+ recommended.</p>
              </div>

              {/* -------- Optional: Add a Pool -------- */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setAddPoolOpen((v) => !v)}
                  className="text-sm underline text-primary"
                >
                  {addPoolOpen ? "Remove pool" : "Add a pool"}
                </button>
              </div>

              {addPoolOpen && (
                <AddPoolForm
                  tokenA={tokenIn}
                  onSelectTokenA={onSelectTokenA}
                  tokenB={userToken}
                  poolPct={poolPct}
                  setPoolPct={setPoolPct}
                  poolSupplyTokens={poolSupplyTokens}
                  creatorSupplyTokens={creatorSupplyTokens}
                  amountIn={amountInText}
                  setAmountIn={setAmountInText}
                  feeOrHook={feeOrHook}
                  setFeeOrHook={setFeeOrHook}
                  isHook={isHook}
                />
              )}

              {!account && (
                <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
                  <AlertTitle className="text-blue-800 dark:text-blue-200">Wallet required</AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    Connect your wallet to continue.
                  </AlertDescription>
                </Alert>
              )}

              {writeError && (
                <Alert variant="destructive">
                  <AlertTitle>Transaction error</AlertTitle>
                  <AlertDescription className="break-words">{writeError.message}</AlertDescription>
                </Alert>
              )}

              <Button disabled={submitting || isPending || !account} className="w-full" onClick={onSubmit}>
                {buttonLabel}
              </Button>

              {hash && (
                <Alert className="mt-2">
                  <AlertTitle>Transaction sent</AlertTitle>
                  <AlertDescription className="break-all">{hash}</AlertDescription>
                </Alert>
              )}

              {txSuccess && (
                <Alert className="mt-2">
                  <AlertTitle>Transaction confirmed</AlertTitle>
                  <AlertDescription>
                    {coinId ? (
                      <div>
                        <Link
                          to={"/c/$coinId"}
                          params={{
                            coinId: coinId.toString(),
                          }}
                          className="font-mono hover:underline text-primary"
                        >
                          Coin {coinId.toString()} minted. View here.
                        </Link>
                      </div>
                    ) : (
                      "Your token was created."
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {txLoading && (
                <Alert className="mt-2">
                  <AlertTitle>Waiting for confirmation…</AlertTitle>
                  <AlertDescription>Your transaction is being mined.</AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCoinWizard;
