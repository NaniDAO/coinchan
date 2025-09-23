import { useState, useMemo } from "react";
import { WrapTextIcon } from "lucide-react";
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatUnits, parseUnits } from "viem";

import { TokenMetadata } from "@/lib/pools";
import { Heading } from "./ui/typography";
import { Dialog, DialogContent, DialogTrigger } from "./ui/8bit/dialog";

// shadcn/ui
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import {
  ERC6909ERC20WrapperAbi,
  ERC6909ERC20WrapperAddress,
} from "@/constants/ERC6909ERC20Wrapper";
import { useTokenApproval } from "@/hooks/use-token-approval";
import { useOperatorStatus } from "@/hooks/use-operator-status";
import { erc6909Abi } from "zrouter-sdk";
import {
  getProtocol,
  getProtocolIdBySource,
  getSourceByContract,
} from "@/lib/protocol";
import { toast } from "sonner";
import { CookbookAddress } from "@/constants/Cookbook";
import { CoinsAddress } from "@/constants/Coins";

type Props = { token: TokenMetadata };

export const WrapTokenManager = ({ token }: Props) => {
  // Only ERC6909 can be wrapped; don't render trigger/UI otherwise
  if (!token || token.standard === "ERC20") return null;
  if (token.standard !== "ERC6909") return null;

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { data: operatorStatus, refetch: refetchOperatorStatus } =
    useOperatorStatus({
      address,
      operator: ERC6909ERC20WrapperAddress,
      tokenId: token.id,
    });

  const [tab, setTab] = useState<"wrap" | "unwrap">("wrap");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const decimals = Number.isFinite(token.decimals) ? token.decimals : 18;

  const humanBalance =
    token.balance !== undefined
      ? formatUnits(token.balance as bigint, decimals)
      : "0";

  const hasPositiveAmount = useMemo(() => {
    const n = Number(amount);
    return !!amount && Number.isFinite(n) && n > 0;
  }, [amount]);

  const disabled = submitting || !hasPositiveAmount;

  const fillMax = () => {
    setAmount(humanBalance);
  };

  const safeParseAmount = (value: string) => {
    // Basic guard to avoid parse errors on weird input like "."
    const trimmed = value.trim();
    if (!trimmed || trimmed === "." || trimmed === "-") return null;
    try {
      return parseUnits(trimmed as `${number}`, decimals);
    } catch {
      return null;
    }
  };

  const handleTx = async (mode: "wrap" | "unwrap") => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      if (!publicClient) throw new Error("Public client not found");
      const amt = safeParseAmount(amount);
      if (amt === null || amt <= 0n) {
        throw new Error("Enter a valid positive amount.");
      }

      const fn = mode === "wrap" ? "wrap" : "unwrap";

      if (mode === "wrap") {
        // check operator status
        if (operatorStatus === false) {
          const source = getSourceByContract(token.address);

          const approvalHash = await writeContractAsync({
            abi: erc6909Abi,
            address: source === "COOKBOOK" ? CookbookAddress : CoinsAddress,
            functionName: "setOperator",
            args: [ERC6909ERC20WrapperAddress, true],
          });

          await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          await refetchOperatorStatus();
          toast("Operator status updated successfully");
        }
      }
      // wrap(IERC6909 erc6909, uint256 id, uint256 amount)
      // unwrap(IERC6909 erc6909, uint256 id, uint256 amount)
      const hash = await writeContractAsync({
        abi: ERC6909ERC20WrapperAbi,
        address: ERC6909ERC20WrapperAddress,
        functionName: fn,
        args: [token.address, token.id, amt],
      });

      setAmount("");
      return hash;
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.shortMessage || err?.message || "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger className="border p-1 border-border rounded-md flex flex-row items-center text-sm tracking-wide font-mono hover:underline">
        <WrapTextIcon className="mr-2 h-4 w-4" />
        Manage Wrap
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px]">
        <div className="space-y-3">
          <Heading level={4}>Token Wrap Manager</Heading>
          <p className="text-xs text-muted-foreground">
            {token?.symbol ?? "Token"} · ID: {String(token?.id)} · Decimals:{" "}
            {decimals}
          </p>
        </div>

        <Separator />

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "wrap" | "unwrap")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wrap">Wrap</TabsTrigger>
            <TabsTrigger value="unwrap">Unwrap</TabsTrigger>
          </TabsList>

          {/* Wrap tab */}
          <TabsContent value="wrap" className="mt-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wrap-amount">Amount</Label>
                  <span className="text-xs text-muted-foreground">
                    Balance: {humanBalance} {token.symbol}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Input
                    id="wrap-amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={tab === "wrap" ? amount : ""}
                    onChange={(e) => {
                      if (tab !== "wrap") return;
                      setAmount(e.target.value);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={fillMax}
                    disabled={submitting || humanBalance === "0"}
                  >
                    Max
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Wrap ERC-6909 units into their ERC-20 representation.
                </p>
              </div>

              {errorMsg && tab === "wrap" && (
                <p className="text-xs text-destructive">{errorMsg}</p>
              )}

              <Button
                className="w-full"
                disabled={disabled && tab === "wrap"}
                onClick={() => handleTx("wrap")}
              >
                {submitting ? "Wrapping..." : "Wrap"}
              </Button>
            </div>
          </TabsContent>

          {/* Unwrap tab */}
          <TabsContent value="unwrap" className="mt-4">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="unwrap-amount">Amount</Label>
                <Input
                  id="unwrap-amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={tab === "unwrap" ? amount : ""}
                  onChange={(e) => {
                    if (tab !== "unwrap") return;
                    setAmount(e.target.value);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Unwrap the ERC-20 representation back to ERC-6909 units.
                </p>
              </div>

              {errorMsg && tab === "unwrap" && (
                <p className="text-xs text-destructive">{errorMsg}</p>
              )}

              <Button
                variant="secondary"
                className="w-full"
                disabled={disabled && tab === "unwrap"}
                onClick={() => handleTx("unwrap")}
              >
                {submitting ? "Unwrapping..." : "Unwrap"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
