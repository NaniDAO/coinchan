import React, { useState, useMemo, useEffect } from "react";
import { parseEther, formatEther, encodeFunctionData, isAddress, zeroAddress } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useEnsAddress, useBalance } from "wagmi";
import { toast } from "sonner";
import { normalize } from "viem/ens";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, Coins, Clock, Sparkles, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { ResolverAddress, ResolverAbi, ResolverOp } from "@/constants/Resolver";
import { DEFAULT_FEE_OR_HOOK } from "@/constants/PAMMSingleton";
import { isUserRejectionError } from "@/lib/errors";

// Common ERC20 ABI for balanceOf encoding
const ERC20_BALANCE_OF_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Popular tokens for quick selection (ERC20 standard balanceOf compatible)
const POPULAR_TOKENS = [
  { symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "DAI", address: "0x6B175474E89094C44Da98b954EesdeBC3E36a30", decimals: 18 },
  { symbol: "wstETH", address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", decimals: 18 },
  { symbol: "UNI", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", decimals: 18 },
];

// Deadline presets
type DeadlinePreset =
  | { label: string; seconds: number; timestamp?: never }
  | { label: string; seconds?: never; timestamp: number };

const DEADLINE_PRESETS: DeadlinePreset[] = [
  { label: "1 Hour", seconds: 3600 },
  { label: "24 Hours", seconds: 86400 },
  { label: "1 Week", seconds: 604800 },
  { label: "1 Month", seconds: 2592000 },
  { label: "End of 2025", timestamp: 1767225599 },
];

type MarketType = "eth-balance" | "erc20-balance" | "price" | "governance" | "supply";

interface CreateOracleMarketProps {
  onSuccess?: () => void;
}

export const CreateOracleMarket: React.FC<CreateOracleMarketProps> = ({ onSuccess }) => {
  const { address } = useAccount();
  const { data: userBalance } = useBalance({ address });

  // Form state
  const [marketType, setMarketType] = useState<MarketType>("eth-balance");
  const [targetInput, setTargetInput] = useState("");
  const [threshold, setThreshold] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenDecimals, setTokenDecimals] = useState(18);
  const [deadlinePreset, setDeadlinePreset] = useState<string>("24h");
  const [customDeadline, setCustomDeadline] = useState("");
  const [seedLiquidity, setSeedLiquidity] = useState("0.01");
  const [canCloseEarly, setCanCloseEarly] = useState(true);
  const [operation, setOperation] = useState<ResolverOp>(ResolverOp.GTE);
  const [customObservable, setCustomObservable] = useState("");

  // ENS resolution
  const isEnsName = targetInput.includes(".");
  const { data: resolvedAddress, isLoading: isResolvingEns } = useEnsAddress({
    name: isEnsName ? normalize(targetInput) : undefined,
    chainId: 1,
  });

  const targetAddress = useMemo(() => {
    if (isEnsName && resolvedAddress) {
      return resolvedAddress;
    }
    if (isAddress(targetInput)) {
      return targetInput as `0x${string}`;
    }
    return undefined;
  }, [targetInput, isEnsName, resolvedAddress]);

  // Calculate deadline timestamp
  const deadlineTimestamp = useMemo((): number => {
    const defaultDeadline = Math.floor(Date.now() / 1000) + 86400; // Default 24h

    if (deadlinePreset === "custom") {
      const date = new Date(customDeadline);
      const ts = Math.floor(date.getTime() / 1000);
      return Number.isNaN(ts) ? defaultDeadline : ts;
    }

    const preset = DEADLINE_PRESETS.find(
      (p) => p.label.toLowerCase().replace(" ", "") === deadlinePreset.toLowerCase().replace(" ", ""),
    );

    if (preset) {
      if (preset.timestamp !== undefined) return preset.timestamp;
      if (preset.seconds !== undefined) return Math.floor(Date.now() / 1000) + preset.seconds;
    }

    return defaultDeadline;
  }, [deadlinePreset, customDeadline]);

  // Build observable description
  const observable = useMemo(() => {
    if (customObservable) return customObservable;

    const shortAddr = targetAddress ? `${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}` : "?";
    const targetDisplay = isEnsName ? targetInput : shortAddr;

    if (marketType === "eth-balance") {
      return `ETH balance of ${targetDisplay}`;
    } else {
      const token = POPULAR_TOKENS.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());
      const tokenSymbol = token?.symbol || tokenAddress.slice(0, 6) + "...";
      return `${tokenSymbol} balance of ${targetDisplay}`;
    }
  }, [marketType, targetAddress, targetInput, tokenAddress, isEnsName, customObservable]);

  // Build callData for the condition
  // Resolver.sol _readUint() logic:
  //   - Empty callData = returns target.balance (native ETH balance)
  //   - Non-empty callData = calls target.staticcall(callData), decodes as uint256
  // So:
  //   - ETH balance: target = address to check, callData = empty
  //   - ERC20 balance: target = token contract, callData = balanceOf(addressToCheck)
  const callData = useMemo(() => {
    if (marketType === "eth-balance") {
      // Empty callData triggers native ETH balance check in Resolver
      return "0x" as `0x${string}`;
    }

    // ERC20: encode balanceOf(targetAddress) to call on token contract
    if (!targetAddress) return "0x" as `0x${string}`;
    return encodeFunctionData({
      abi: ERC20_BALANCE_OF_ABI,
      functionName: "balanceOf",
      args: [targetAddress],
    });
  }, [marketType, targetAddress]);

  // Calculate threshold in wei
  const thresholdWei = useMemo(() => {
    try {
      const decimals = marketType === "eth-balance" ? 18 : tokenDecimals;
      if (decimals === 18) {
        return parseEther(threshold || "0");
      } else {
        return BigInt(Math.floor(Number(threshold || 0) * 10 ** decimals));
      }
    } catch {
      return 0n;
    }
  }, [threshold, marketType, tokenDecimals]);

  // Contract write
  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Handle success
  useEffect(() => {
    if (isSuccess) {
      toast.success("Market created successfully!");
      onSuccess?.();
    }
  }, [isSuccess, onSuccess]);

  // Validation
  const validationError = useMemo(() => {
    if (!targetAddress) return "Enter a valid address or ENS name";
    if (!threshold || Number(threshold) <= 0) return "Enter a threshold amount";
    if (marketType === "erc20-balance" && !isAddress(tokenAddress)) return "Enter a valid token address";
    if (!seedLiquidity || Number(seedLiquidity) < 0.001) return "Minimum seed liquidity is 0.001 ETH";
    if (deadlineTimestamp <= Math.floor(Date.now() / 1000)) return "Deadline must be in the future";
    return null;
  }, [targetAddress, threshold, marketType, tokenAddress, seedLiquidity, deadlineTimestamp]);

  const handleCreate = async () => {
    if (!address || validationError) return;

    const seedValue = parseEther(seedLiquidity);

    // Target address depends on market type:
    // - ETH balance: target = address to check (Resolver returns target.balance)
    // - ERC20 balance: target = token contract (Resolver calls target.balanceOf(walletToCheck))

    // Determine target based on market type
    const target =
      marketType === "eth-balance"
        ? targetAddress! // ETH: target is the address whose balance we check
        : (tokenAddress as `0x${string}`); // ERC20: target is the token contract

    try {
      writeContract({
        address: ResolverAddress,
        abi: ResolverAbi,
        functionName: "createNumericMarketAndSeed",
        args: [
          observable,
          zeroAddress, // ETH collateral (address(0))
          target,
          callData,
          operation,
          thresholdWei,
          BigInt(deadlineTimestamp),
          canCloseEarly,
          {
            collateralIn: seedValue,
            feeOrHook: DEFAULT_FEE_OR_HOOK,
            amount0Min: 0n,
            amount1Min: 0n,
            minLiquidity: 0n,
            lpRecipient: address,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
          },
        ],
        value: seedValue,
      });
    } catch (err) {
      if (!isUserRejectionError(err)) {
        toast.error("Failed to create market");
        console.error(err);
      }
    }
  };

  const formatDeadline = (ts: number) => {
    return new Date(ts * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const opSymbols: Record<ResolverOp, string> = {
    [ResolverOp.LT]: "<",
    [ResolverOp.GT]: ">",
    [ResolverOp.LTE]: "<=",
    [ResolverOp.GTE]: ">=",
    [ResolverOp.EQ]: "==",
    [ResolverOp.NEQ]: "!=",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
            <Sparkles className="h-3 w-3 mr-1" />
            Oracle Market
          </Badge>
        </div>
        <h2 className="text-xl font-bold">Create Onchain Event Market</h2>
        <p className="text-sm text-muted-foreground">Markets resolve automatically via onchain oracle</p>
      </div>

      {/* Market Type Tabs */}
      <Tabs value={marketType} onValueChange={(v) => setMarketType(v as MarketType)}>
        <TabsList className="w-full flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="eth-balance" className="flex-1 min-w-[120px]">
            <Wallet className="h-4 w-4 mr-2" />
            ETH Balance
          </TabsTrigger>
          <TabsTrigger value="erc20-balance" className="flex-1 min-w-[120px]">
            <Coins className="h-4 w-4 mr-2" />
            Token Balance
          </TabsTrigger>
          <TabsTrigger value="price" className="flex-1 min-w-[100px] text-muted-foreground" disabled>
            <span className="mr-1">📈</span>
            Price
            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
              Soon
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="governance" className="flex-1 min-w-[110px] text-muted-foreground" disabled>
            <span className="mr-1">🗳️</span>
            Governance
            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
              Soon
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="supply" className="flex-1 min-w-[100px] text-muted-foreground" disabled>
            <span className="mr-1">🔥</span>
            Supply
            <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
              Soon
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* ETH Balance Market */}
        <TabsContent value="eth-balance" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Target Address</CardTitle>
              <CardDescription>The address whose ETH balance will be checked. Supports ENS names.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Input
                  placeholder="vitalik.eth or 0x..."
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                />
                {isResolvingEns && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {targetAddress && !isResolvingEns && (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                )}
              </div>
              {isEnsName && resolvedAddress && (
                <p className="text-xs text-muted-foreground font-mono">Resolves to: {resolvedAddress}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Condition</CardTitle>
              <CardDescription>Market resolves YES if balance meets condition at deadline</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={String(operation)} onValueChange={(v) => setOperation(Number(v) as ResolverOp)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(ResolverOp.GTE)}>{"≥"}</SelectItem>
                    <SelectItem value={String(ResolverOp.GT)}>{">"}</SelectItem>
                    <SelectItem value={String(ResolverOp.LTE)}>{"≤"}</SelectItem>
                    <SelectItem value={String(ResolverOp.LT)}>{"<"}</SelectItem>
                    <SelectItem value={String(ResolverOp.EQ)}>{"="}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1 relative">
                  <Input
                    type="number"
                    placeholder="1.0"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="pr-12"
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">ETH</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ERC20 Balance Market */}
        <TabsContent value="erc20-balance" className="space-y-4 pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Token</CardTitle>
              <CardDescription>Select a token or enter a custom address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {POPULAR_TOKENS.map((token) => (
                  <Button
                    key={token.symbol}
                    variant={tokenAddress.toLowerCase() === token.address.toLowerCase() ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setTokenAddress(token.address);
                      setTokenDecimals(token.decimals);
                    }}
                  >
                    {token.symbol}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="0x... (token contract address)"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
              />
              {tokenAddress && !POPULAR_TOKENS.some((t) => t.address.toLowerCase() === tokenAddress.toLowerCase()) && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs">Decimals:</Label>
                  <Input
                    type="number"
                    className="w-20 h-8"
                    value={tokenDecimals}
                    onChange={(e) => setTokenDecimals(Number(e.target.value))}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Target Address</CardTitle>
              <CardDescription>The address whose token balance will be checked. Supports ENS names.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Input
                  placeholder="vitalik.eth or 0x..."
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                />
                {isResolvingEns && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {targetAddress && !isResolvingEns && (
                  <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                )}
              </div>
              {isEnsName && resolvedAddress && (
                <p className="text-xs text-muted-foreground font-mono">Resolves to: {resolvedAddress}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Condition</CardTitle>
              <CardDescription>Market resolves YES if balance meets condition at deadline</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Select value={String(operation)} onValueChange={(v) => setOperation(Number(v) as ResolverOp)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={String(ResolverOp.GTE)}>{"≥"}</SelectItem>
                    <SelectItem value={String(ResolverOp.GT)}>{">"}</SelectItem>
                    <SelectItem value={String(ResolverOp.LTE)}>{"≤"}</SelectItem>
                    <SelectItem value={String(ResolverOp.LT)}>{"<"}</SelectItem>
                    <SelectItem value={String(ResolverOp.EQ)}>{"="}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-1">
                  <Input
                    type="number"
                    placeholder="100"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deadline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Deadline
          </CardTitle>
          <CardDescription>When the market will check the condition and resolve</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {DEADLINE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant={deadlinePreset === preset.label.toLowerCase().replace(" ", "") ? "default" : "outline"}
                size="sm"
                onClick={() => setDeadlinePreset(preset.label.toLowerCase().replace(" ", ""))}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant={deadlinePreset === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setDeadlinePreset("custom")}
            >
              Custom
            </Button>
          </div>
          {deadlinePreset === "custom" && (
            <Input type="datetime-local" value={customDeadline} onChange={(e) => setCustomDeadline(e.target.value)} />
          )}
          <p className="text-xs text-muted-foreground">Resolves: {formatDeadline(deadlineTimestamp)}</p>
        </CardContent>
      </Card>

      {/* Early Resolution Toggle */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Allow Early Resolution</Label>
              <p className="text-xs text-muted-foreground">
                If enabled, market can resolve YES as soon as condition is met
              </p>
            </div>
            <Switch checked={canCloseEarly} onCheckedChange={setCanCloseEarly} />
          </div>
        </CardContent>
      </Card>

      {/* Seed Liquidity */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Seed Liquidity</CardTitle>
          <CardDescription>Initial ETH to provide as market liquidity (you become LP)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {["0.01", "0.05", "0.1", "0.5"].map((amount) => (
              <Button
                key={amount}
                variant={seedLiquidity === amount ? "default" : "outline"}
                size="sm"
                onClick={() => setSeedLiquidity(amount)}
              >
                {amount} ETH
              </Button>
            ))}
          </div>
          <div className="relative">
            <Input
              type="number"
              step="0.001"
              min="0.001"
              value={seedLiquidity}
              onChange={(e) => setSeedLiquidity(e.target.value)}
              className="pr-12"
            />
            <span className="absolute right-3 top-2.5 text-sm text-muted-foreground">ETH</span>
          </div>
          {userBalance && (
            <p className="text-xs text-muted-foreground">
              Balance: {Number(formatEther(userBalance.value)).toFixed(4)} ETH
            </p>
          )}
        </CardContent>
      </Card>

      {/* Custom Observable (Advanced) */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Advanced: Custom Description
        </summary>
        <div className="mt-2">
          <Input
            placeholder="Custom market description (optional)"
            value={customObservable}
            onChange={(e) => setCustomObservable(e.target.value)}
          />
        </div>
      </details>

      {/* Preview */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Market Preview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="p-3 rounded-lg bg-background border">
            <p className="font-medium">{observable}</p>
            <p className="text-muted-foreground mt-1">
              {opSymbols[operation]} {threshold || "?"} {marketType === "eth-balance" ? "ETH" : "tokens"}
            </p>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Deadline: {formatDeadline(deadlineTimestamp)}</span>
            <span>Seed: {seedLiquidity} ETH</span>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {validationError && <p className="text-sm text-destructive text-center">{validationError}</p>}

      {/* Create Button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleCreate}
        disabled={!address || !!validationError || isPending || isConfirming}
      >
        {isPending || isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {isPending ? "Confirm in wallet..." : "Creating..."}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Create Oracle Market
          </>
        )}
      </Button>

      {/* Success */}
      {isSuccess && txHash && (
        <div className="text-center space-y-2">
          <p className="text-sm text-green-600 font-medium">Market created successfully!</p>
          <a
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary flex items-center justify-center gap-1"
          >
            View on Etherscan <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Info */}
      <p className="text-xs text-center text-muted-foreground">
        Markets use the Resolver oracle contract for trustless, onchain resolution.
      </p>
    </div>
  );
};

export default CreateOracleMarket;
