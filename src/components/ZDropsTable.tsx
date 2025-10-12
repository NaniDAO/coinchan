"use client";

import * as React from "react";
import { Address, formatUnits, parseUnits, Hex, getAddress } from "viem";
import { useReadContract, useWriteContract } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Heading } from "./ui/typography";
import { Link } from "@tanstack/react-router";
import { useGetToken } from "@/hooks/use-get-token";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { TokenImage } from "./TokenImage";
import { VEZAMM_TOKEN } from "@/lib/pools";
import { ZDrop } from "@/hooks/use-get-z-drops";

export const ZDropsTable = ({
  zDrops,
}: {
  zDrops: {
    eligible: boolean;
    drops: { items: ZDrop[] };
  };
}) => {
  const { eligible, drops } = zDrops;

  return (
    <div className="p-2">
      <div>
        <Heading level={2}>Your zDrops</Heading>
        {!eligible && (
          <Link
            to="/farm"
            className="text-sm text-destructive-foreground mt-2 block hover:underline visited:text-primary"
          >
            veZAMM holders are eligible to claim airdrops. Get veZAMM by farming ZAMM.
          </Link>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1">
        {drops.items.map((drop) => (
          <ZDropClaim key={String(drop.id)} drop={drop} />
        ))}
      </div>
    </div>
  );
};

const ZDropClaim: React.FC<{ drop: ZDrop }> = ({ drop }) => {
  // Fetch token metas/balances
  const { data: tokenIn } = useGetToken({
    token: {
      address: drop.tokenIn as Address,
      id: BigInt(drop.idIn),
    },
  });

  const { data: tokenOut } = useGetToken({
    token: {
      address: drop.tokenOut as Address,
      id: BigInt(drop.idOut),
    },
  });

  // Compute the canonical order hash locally (must exactly match solidity abi.encode order):
  const orderHash = React.useMemo(() => {
    return drop.id as Hex;
  }, [drop]);

  // Read on-chain progress: orders[orderHash] -> { partialFill, deadline, inDone, outDone }
  const { data: orderData } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "orders",
    args: [orderHash as `0x${string}`],
    query: {
      // refetch to keep progress fresh as claims happen
      refetchInterval: 12_000,
    } as any,
  }) as {
    data:
      | {
          partialFill: boolean;
          deadline: bigint; // uint56
          inDone: bigint; // uint96
          outDone: bigint; // uint96
        }
      | undefined;
  };

  const inDone = orderData?.inDone ?? 0n;
  const outDone = orderData?.outDone ?? 0n;
  const amtIn = BigInt(drop.amtIn);
  const amtOut = BigInt(drop.amtOut);
  const remainIn = amtIn - inDone;
  const remainOut = amtOut - outDone;

  // Interpret "tokenOut is what the taker pays".
  // For the intended airdrop flow (user pays veZAMM), tokenOut should be veZAMM.
  // We'll detect that and compute claim capacity accordingly.
  const takerPaysIsVeZAMM =
    (drop.tokenOut as Address)?.toLowerCase() === VEZAMM_TOKEN.address.toLowerCase() &&
    drop.idOut === VEZAMM_TOKEN.id.toString();

  const veZammBalance = takerPaysIsVeZAMM ? tokenOut?.balance ?? 0n : tokenIn?.balance ?? 0n; // fallback if your setup flips them (not recommended)

  // For partial fills: taker chooses "sliceOut" (amount of tokenOut to pay).
  // Max they can pay is the min of their balance and remainingOut.
  const maxPayableOut = takerPaysIsVeZAMM ? (veZammBalance < remainOut ? veZammBalance : remainOut) : 0n;

  // If the order is non-partial, user must take exactly the full remainder:
  const requiredOutIfNonPartial = drop.partialFill ? undefined : remainOut;

  // Derive what the user will receive for a given "sliceOut":
  // sliceIn = floor(amtIn * sliceOut / amtOut)
  const quoteReceiveForOut = React.useCallback((sliceOut: bigint) => (amtIn * sliceOut) / amtOut, [amtIn, amtOut]);

  // UI state: desired "fillPart" = how much tokenOut the user wants to pay
  const [desiredOut, setDesiredOut] = React.useState<bigint>(0n);

  // Initialize default desiredOut to the max they can claim (or the required full remainder if non-partial)
  React.useEffect(() => {
    if (!drop.partialFill && requiredOutIfNonPartial !== undefined) {
      setDesiredOut(requiredOutIfNonPartial);
    } else {
      setDesiredOut(maxPayableOut);
    }
  }, [drop.partialFill, maxPayableOut, requiredOutIfNonPartial]);

  // Pretty numbers
  const fmt = (v: bigint, decimals?: number) =>
    decimals !== undefined ? Number(formatUnits(v, decimals)).toLocaleString() : v.toString();

  const inDecimals = tokenIn?.decimals ?? 18;
  const outDecimals = tokenOut?.decimals ?? 18;

  const userReceivesIn = quoteReceiveForOut(desiredOut);
  const progressPct = Number((outDone * 10000n) / (amtOut === 0n ? 1n : amtOut)) / 100;

  const nowSec = Math.floor(Date.now() / 1000);
  const expired = Number(drop.deadline) <= nowSec || (orderData && Number(orderData.deadline) <= nowSec);
  const fullyFilled = remainOut === 0n || remainIn === 0n;

  // Final button disabled states
  const cannotClaimBecauseFlip = !takerPaysIsVeZAMM && drop.status === "ACTIVE"; // order created with opposite orientation
  const insufficientBalance = takerPaysIsVeZAMM && desiredOut > (tokenOut?.balance ?? 0n);
  const invalidAmount =
    desiredOut <= 0n ||
    (!drop.partialFill && requiredOutIfNonPartial !== undefined && desiredOut !== requiredOutIfNonPartial);

  const claimDisabled =
    expired ||
    fullyFilled ||
    drop.status !== "ACTIVE" ||
    cannotClaimBecauseFlip ||
    insufficientBalance ||
    invalidAmount;

  const { writeContractAsync, isPending } = useWriteContract();

  const onClaim = async () => {
    if (!writeContractAsync) return;
    // fillPart = desiredOut (amount of tokenOut to pay) for partial fills
    // For non-partial, you may pass 0 or full amtOut; we'll pass the exact remainder for clarity.
    const fillPart = drop.partialFill ? desiredOut : remainOut;

    await writeContractAsync({
      address: CookbookAddress as Address,
      abi: CookbookAbi,
      functionName: "fillOrder",
      args: [
        getAddress(drop.maker),
        getAddress(drop.tokenIn),
        BigInt(drop.idIn),
        BigInt(drop.amtIn),
        getAddress(drop.tokenOut),
        BigInt(drop.idOut),
        BigInt(drop.amtOut),
        BigInt(drop.deadline),
        drop.partialFill,
        fillPart, // <— amount of tokenOut (veZAMM) you're paying
      ],
    });
  };

  // Helpers for controlled numeric input (tokenOut units)
  const handleOutInput = (val: string) => {
    try {
      const parsed = parseUnits(val || "0", outDecimals);
      const capped = parsed > maxPayableOut ? maxPayableOut : parsed;
      setDesiredOut(capped < 0n ? 0n : capped);
    } catch {
      // ignore parse errors
    }
  };

  const tokenOutSymbol = tokenOut?.symbol || "OUT";
  const tokenInSymbol = tokenIn?.symbol || "IN";

  return (
    <Card className="col-span-1 border rounded-xl shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TokenImage imageUrl={tokenIn?.imageUrl} symbol={tokenInSymbol} />{" "}
            <span className="font-semibold">{tokenInSymbol}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={drop.status === "ACTIVE" ? "default" : "secondary"}>{drop.status}</Badge>
            {expired && <Badge variant="destructive">Expired</Badge>}
            {fullyFilled && <Badge variant="outline">Filled</Badge>}
          </div>
        </div>
        <CardDescription>
          Claim <span className="font-medium">{tokenInSymbol}</span> with{" "}
          <span className="font-medium">{tokenOutSymbol}</span> while the drop is ongoing.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Order ratio + progress */}
        <div className="rounded-lg bg-muted p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <div className="font-medium">Order</div>
              <div className="text-muted-foreground">
                {fmt(amtIn, inDecimals)} {tokenInSymbol} for {fmt(amtOut, outDecimals)} {tokenOutSymbol}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-medium">Remaining</div>
              <div className="text-muted-foreground">
                {fmt(remainIn, inDecimals)} {tokenInSymbol} • {fmt(remainOut, outDecimals)} {tokenOutSymbol}
              </div>
            </div>
          </div>

          <div className="mt-2">
            <Progress value={progressPct} className="h-2" />
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>
                Claimed: {fmt(outDone, outDecimals)} {tokenOutSymbol}
              </span>
              <span>{progressPct.toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* Wallet + deadline */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Your veZAMM</div>
            <div className="text-sm font-medium">
              {fmt(
                (takerPaysIsVeZAMM ? tokenOut?.balance : tokenIn?.balance) ?? 0n,
                takerPaysIsVeZAMM ? outDecimals : inDecimals,
              )}{" "}
              veZAMM
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Deadline (UTC)</div>
            <div className="text-sm font-medium">{new Date(Number(drop.deadline) * 1000).toUTCString()}</div>
          </div>
        </div>

        <Separator />

        {/* Amount selector */}
        <div className="space-y-2">
          {takerPaysIsVeZAMM ? (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor={`pay-${drop.id}`} className="text-sm">
                  You pay (veZAMM)
                </Label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => setDesiredOut(maxPayableOut)}
                  disabled={maxPayableOut === 0n}
                >
                  Max
                </Button>
              </div>
              <Input
                id={`pay-${drop.id}`}
                type="number"
                inputMode="decimal"
                placeholder="0.0"
                value={formatUnits(desiredOut, outDecimals)}
                onChange={(e) => handleOutInput(e.target.value)}
                disabled={!drop.partialFill || expired || fullyFilled || drop.status !== "ACTIVE"}
              />

              <div className="text-xs text-muted-foreground">
                You’ll receive:{" "}
                <span className="font-medium">
                  {fmt(userReceivesIn, inDecimals)} {tokenInSymbol}
                </span>
              </div>
            </>
          ) : (
            <div className="text-xs text-destructive">Farm {tokenOutSymbol} to claim future zDrops.</div>
          )}
        </div>

        <Button className="w-full" disabled={claimDisabled || isPending} onClick={onClaim}>
          {isPending ? "Claiming..." : "Claim"}
        </Button>

        {/* Tiny footnote on ratios */}
        <div className="text-[11px] text-muted-foreground text-center">
          Rate: 1 {tokenOutSymbol} → {(Number(amtIn) / Number(amtOut) || 0).toFixed(6)} {tokenInSymbol}
        </div>
      </CardContent>
    </Card>
  );
};
