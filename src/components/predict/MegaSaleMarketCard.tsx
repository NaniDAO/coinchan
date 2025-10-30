import React, { useMemo, useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import {
  MegaSalePMResolverAddress,
  MegaSalePMResolverAbi,
} from "@/constants/MegaSalePMResolver";
import {
  PredictionAMMAbi,
  PredictionAMMAddress,
} from "@/constants/PredictionMarketAMM";
import { formatUSDT } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronDown, ChevronUp, Info } from "lucide-react";
import { formatEther } from "viem";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TradeModal } from "./TradeModal";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { toast } from "sonner";
import { isUserRejectionError } from "@/lib/errors";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PredictionProbabilityChart } from "./PredictionProbabilityChart";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MarketLeaderboard } from "./MarketLeaderboard";

// MegaETH logo URL
const MEGAETH_LOGO =
  "https://content.wrappr.wtf/ipfs/bafkreiefdha6ms7w3pdbrgdmsdwny373psbdq5t7oaaoryt3hh7pi7ndmy";

// Betting options for the official deadline
// Note: USDT has 6 decimals, so amounts are multiplied by 1e6
const BETTING_OPTIONS = [
  { amount: 1000000000000000n, label: ">$1B" }, // 1B * 1e6
  { amount: 1200000000000000n, label: ">$1.2B" }, // 1.2B * 1e6
  { amount: 1400000000000000n, label: ">$1.4B" }, // 1.4B * 1e6
  { amount: 1800000000000000n, label: ">$1.8B" }, // 1.8B * 1e6
  { amount: 3000000000000000n, label: ">$3B" }, // 3B * 1e6
  { amount: 4000000000000000n, label: ">$4B" }, // 4B * 1e6
];

interface MegaSaleOptionRowProps {
  marketId: bigint;
  label: string;
  liquidity: bigint;
  yesPercent: number;
  yesCost: string;
  noCost: string;
  marketType: "parimutuel" | "amm";
  contractAddress: `0x${string}`;
  onTradeClick: (position: "yes" | "no") => void;
  // NEW:
  canResolve?: boolean;
  resolveReason?: "threshold" | "deadline";
  onResolve?: () => void;
  isResolving?: boolean;
  resolved?: boolean;
  outcome?: boolean;
  userClaimable?: bigint;
  onClaim?: () => void;
  isClaiming?: boolean;
}

export const MegaSaleOptionRow: React.FC<MegaSaleOptionRowProps> = ({
  marketId,
  label,
  liquidity,
  yesPercent,
  yesCost,
  noCost,
  onTradeClick,
  canResolve = false,
  resolveReason,
  onResolve,
  isResolving = false,
  resolved = false,
  outcome = false,
  userClaimable = 0n,
  onClaim,
  isClaiming = false,
}) => {
  const { address } = useAccount();
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: noId } = useReadContract({
    address: PredictionAMMAddress,
    abi: PredictionAMMAbi,
    functionName: "getNoId",
    args: [marketId],
  });

  const { data: yesBal } = useTokenBalance({
    token: { id: marketId, address: PredictionAMMAddress },
    address,
  });

  const { data: noBal } = useTokenBalance({
    token: { id: noId ?? 0n, address: PredictionAMMAddress },
    address,
  });

  const hasYes = (yesBal ?? 0n) > 0n;
  const hasNo = (noBal ?? 0n) > 0n;
  const hasPosition = hasYes || hasNo;
  const canClaim = resolved && userClaimable > 0n;

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className="border-b border-zinc-200 dark:border-zinc-800 last:border-b-0"
    >
      <CollapsibleTrigger asChild>
        <div className="w-full flex justify-between py-4 px-3 sm:px-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors cursor-pointer">
          {/* Mobile: Stack everything vertically */}
          <div className="w-full flex flex-col gap-3 sm:hidden">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {label}
                  </div>
                  {resolved && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        outcome
                          ? "bg-green-500/20 text-green-700 dark:text-green-300"
                          : "bg-red-500/20 text-red-700 dark:text-red-300"
                      }`}
                    >
                      {outcome ? "✓ YES WON" : "✗ NO WON"}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  {Number(formatEther(liquidity)).toFixed(3)} wstETH Vol.
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <div className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {yesPercent.toFixed(0)}%
                  </div>
                  <div className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                    chance
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-zinc-400" />
                )}
              </div>
            </div>

            {/* Position badges */}
            {hasPosition && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2.5 py-1.5 text-[10px] font-medium border border-emerald-200 dark:border-emerald-800/50 w-full overflow-x-auto">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="font-semibold flex-shrink-0">Holding:</span>
                <div className="flex items-center gap-1.5 font-mono flex-1 min-w-0">
                  {hasYes && (
                    <span className="bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                      YES {Number(formatEther(yesBal!)).toFixed(4)}
                    </span>
                  )}
                  {hasNo && (
                    <span className="bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                      NO {Number(formatEther(noBal!)).toFixed(4)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {canClaim && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 px-2.5 py-2 text-[10px] font-semibold border-2 border-emerald-300 dark:border-emerald-700/50 w-full overflow-x-auto shadow-sm">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse flex-shrink-0" />
                <span className="flex-shrink-0">Claimable:</span>
                <span className="font-mono bg-emerald-200 dark:bg-emerald-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                </span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 w-full">
              {canClaim ? (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClaim?.();
                  }}
                  disabled={isClaiming}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/50 font-semibold px-4 py-2 h-auto rounded-md transition-all text-xs flex-1"
                >
                  {isClaiming
                    ? "Claiming..."
                    : `Claim ${Number(formatEther(userClaimable)).toFixed(4)} wstETH`}
                </Button>
              ) : resolved ? (
                <Button
                  disabled
                  variant="outline"
                  className="px-4 py-2 h-auto text-zinc-500 text-xs flex-1"
                >
                  Resolved
                </Button>
              ) : canResolve ? (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onResolve?.();
                  }}
                  disabled={isResolving}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 h-auto rounded-md shadow-sm transition-all text-xs flex-1"
                >
                  {isResolving
                    ? "Resolving..."
                    : resolveReason === "deadline"
                      ? "Resolve (Closed)"
                      : "Resolve"}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTradeClick("yes");
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-semibold px-3 py-2 h-auto rounded-md shadow-sm transition-all flex-1"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] uppercase tracking-wide opacity-90">
                        buy Yes
                      </span>
                      <span className="text-xs">{yesCost}</span>
                    </div>
                  </Button>

                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTradeClick("no");
                    }}
                    className="bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 font-semibold px-3 py-2 h-auto rounded-md shadow-sm transition-all flex-1"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[9px] uppercase tracking-wide opacity-70">
                        buy No
                      </span>
                      <span className="text-xs">{noCost}</span>
                    </div>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Desktop/Tablet: Grid layout */}
          <div className="w-full hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-3">
            <div className="w-full flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {label}
                </div>
                {resolved && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      outcome
                        ? "bg-green-500/20 text-green-700 dark:text-green-300"
                        : "bg-red-500/20 text-red-700 dark:text-red-300"
                    }`}
                  >
                    {outcome ? "✓ YES WON" : "✗ NO WON"}
                  </span>
                )}
              </div>

              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                {Number(formatEther(liquidity)).toFixed(3)} wstETH Vol.
              </div>

              {hasPosition && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-3 py-1.5 text-xs font-medium border border-emerald-200 dark:border-emerald-800/50 w-fit">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" />
                  <span className="font-semibold">Holding:</span>
                  <div className="flex items-center gap-2 font-mono">
                    {hasYes && (
                      <span className="bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                        YES {Number(formatEther(yesBal!)).toFixed(4)}
                      </span>
                    )}
                    {hasNo && (
                      <span className="bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                        NO {Number(formatEther(noBal!)).toFixed(4)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {canClaim && (
                <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 px-3 py-2 text-xs font-semibold border-2 border-emerald-300 dark:border-emerald-700/50 w-fit shadow-sm">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-600 animate-pulse flex-shrink-0" />
                  <span>Claimable:</span>
                  <span className="font-mono bg-emerald-200 dark:bg-emerald-900/80 px-2 py-0.5 rounded">
                    {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                  </span>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                {yesPercent.toFixed(2)}%
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                chance
              </div>
            </div>

            {/* Action buttons based on market state */}
            {canClaim ? (
              // Show claim button if user has winnings
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onClaim?.();
                }}
                disabled={isClaiming}
                className="bg-gradient-to-r from-emerald-500/15 to-emerald-600/15 hover:from-emerald-500/25 hover:to-emerald-600/25 text-emerald-700 dark:text-emerald-300 border-2 border-emerald-400/50 dark:border-emerald-600/50 hover:border-emerald-500/70 dark:hover:border-emerald-500/70 font-semibold px-6 py-2.5 h-auto rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
                size="sm"
              >
                {isClaiming ? (
                  "Claiming..."
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider opacity-80">
                      Claim Winnings
                    </span>
                    <span className="text-sm font-bold">
                      {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                    </span>
                  </div>
                )}
              </Button>
            ) : resolved ? (
              // Show resolved state for markets without claimable winnings
              <Button
                disabled
                variant="outline"
                className="px-4 py-2 h-auto text-zinc-500"
                size="sm"
              >
                Resolved
              </Button>
            ) : canResolve ? (
              // Show resolve button when threshold is met or deadline passed
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onResolve?.();
                }}
                disabled={isResolving}
                className="bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold px-5 py-2.5 h-auto rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                size="sm"
              >
                {isResolving ? (
                  "Resolving..."
                ) : (
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] uppercase tracking-wider opacity-90">
                      {resolveReason === "deadline"
                        ? "Market Closed"
                        : "Ready to Resolve"}
                    </span>
                    <span className="text-sm font-bold">
                      {resolveReason === "deadline"
                        ? "Resolve Now"
                        : "Resolve Market"}
                    </span>
                  </div>
                )}
              </Button>
            ) : (
              // Show trading buttons for active markets
              <>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTradeClick("yes");
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white font-semibold px-4 py-2 h-auto rounded-md shadow-sm transition-all"
                  size="sm"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide opacity-90">
                      buy Yes
                    </span>
                    <span className="text-sm">{yesCost}</span>
                  </div>
                </Button>

                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTradeClick("no");
                  }}
                  className="bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-100 font-semibold px-4 py-2 h-auto rounded-md shadow-sm transition-all"
                  size="sm"
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide opacity-70">
                      buy No
                    </span>
                    <span className="text-sm">{noCost}</span>
                  </div>
                </Button>
              </>
            )}

            {/* Expand/Collapse Indicator */}
            <div className="flex items-center justify-center">
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-zinc-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-zinc-400" />
              )}
            </div>
          </div>
        </div>
      </CollapsibleTrigger>

      {/* Collapsible Chart and Leaderboard Content */}
      <CollapsibleContent>
        <div className="px-4 pb-4 pt-2 bg-zinc-50/50 dark:bg-zinc-900/30">
          <Tabs defaultValue="chart" className="w-full">
            <TabsList className="w-full grid grid-cols-2 mb-4">
              <TabsTrigger value="chart">Chart</TabsTrigger>
              <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              <PredictionProbabilityChart marketId={marketId} />
            </TabsContent>
            <TabsContent value="leaderboard">
              <MarketLeaderboard marketId={marketId} />
            </TabsContent>
          </Tabs>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface MegaSaleMarketCardProps {
  markets: Array<{
    marketId: bigint;
    yesSupply: bigint;
    noSupply: bigint;
    resolved: boolean;
    outcome?: boolean;
    pot: bigint;
    marketType: "parimutuel" | "amm";
    contractAddress: `0x${string}`;
    rYes?: bigint;
    rNo?: bigint;
    description: string;
  }>;
  onTradeSuccess?: () => void;
}

export const MegaSaleMarketCard: React.FC<MegaSaleMarketCardProps> = ({
  markets,
  onTradeSuccess,
}) => {
  const { address } = useAccount();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isResolvingId, setIsResolvingId] = useState<bigint | null>(null);
  const [claimingMarketId, setClaimingMarketId] = useState<bigint | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [selectedMarket, setSelectedMarket] = useState<{
    marketId: bigint;
    yesSupply: bigint;
    noSupply: bigint;
    marketType: "parimutuel" | "amm";
    contractAddress: `0x${string}`;
    position: "yes" | "no";
  } | null>(null);

  // Update current time every minute for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const { data: currentBidAmount } = useReadContract({
    address: MegaSalePMResolverAddress as `0x${string}`,
    abi: MegaSalePMResolverAbi,
    functionName: "totalActiveBidAmount",
    query: { refetchInterval: 15000 },
  });

  const { data: officialDeadline } = useReadContract({
    address: MegaSalePMResolverAddress as `0x${string}`,
    abi: MegaSalePMResolverAbi,
    functionName: "closeAuctionAtTimestamp",
    query: { refetchInterval: 60000 },
  });

  // bets(marketId) -> (amount, deadline)
  const { data: betsData } = useReadContracts({
    contracts: markets.map((m) => ({
      address: MegaSalePMResolverAddress as `0x${string}`,
      abi: MegaSalePMResolverAbi,
      functionName: "bets",
      args: [m.marketId],
    })),
    query: { refetchInterval: 15000, enabled: markets.length > 0 },
  });

  // Quotes for AMM (unchanged)
  const quoteAmount = 1000000000000000000n;
  const ammMarkets = markets.filter((m) => m.marketType === "amm");

  const { data: yesQuotes } = useReadContracts({
    contracts: ammMarkets.map((market) => ({
      address: market.contractAddress,
      abi: PredictionAMMAbi,
      functionName: "quoteBuyYes",
      args: [market.marketId, quoteAmount],
    })),
    query: { refetchInterval: 15000 },
  });

  const { data: noQuotes } = useReadContracts({
    contracts: ammMarkets.map((market) => ({
      address: market.contractAddress,
      abi: PredictionAMMAbi,
      functionName: "quoteBuyNo",
      args: [market.marketId, quoteAmount],
    })),
    query: { refetchInterval: 15000 },
  });

  // Fetch user market data (balances and claimables)
  const { data: userMarketsData } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getUserMarkets",
    args: address ? [address, BigInt(0), BigInt(200)] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 15000,
    },
  });

  const { writeContractAsync } = useWriteContract();

  // Claim transaction handling
  const {
    writeContract: writeClaim,
    data: claimHash,
    error: claimError,
  } = useWriteContract();

  const { isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
  });

  const handleResolve = async (marketId: bigint) => {
    try {
      setIsResolvingId(marketId);
      await writeContractAsync({
        address: MegaSalePMResolverAddress as `0x${string}`,
        abi: MegaSalePMResolverAbi,
        functionName: "resolveBet",
        args: [marketId],
      });
      // Trigger a refetch outside: parent already refetches when onTradeSuccess fires
      onTradeSuccess?.();
    } catch (e) {
      console.error("resolveBet failed:", e);
    } finally {
      setIsResolvingId(null);
    }
  };

  const handleClaim = (marketId: bigint, contractAddress: `0x${string}`) => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }
    setClaimingMarketId(marketId);
    writeClaim({
      address: contractAddress,
      abi: PredictionAMMAbi,
      functionName: "claim",
      args: [marketId, address],
    });
  };

  // Handle claim success
  useEffect(() => {
    if (isClaimSuccess && claimHash) {
      toast.success("Claim successful!");
      setClaimingMarketId(null);
      onTradeSuccess?.();
    }
  }, [isClaimSuccess, claimHash, onTradeSuccess]);

  // Handle claim error
  useEffect(() => {
    if (claimError) {
      setClaimingMarketId(null);

      // Handle user rejection silently
      if (isUserRejectionError(claimError)) {
        return;
      }

      // Show actual errors
      const errorMessage =
        (claimError as any)?.shortMessage ?? claimError?.message ?? "";
      toast.error(errorMessage || "Claim failed");
    }
  }, [claimError]);

  const handleTradeClick = (marketId: bigint, position: "yes" | "no") => {
    const market = markets.find((m) => m.marketId === marketId);
    if (!market) return;
    setSelectedMarket({
      marketId: market.marketId,
      yesSupply: market.yesSupply,
      noSupply: market.noSupply,
      marketType: market.marketType,
      contractAddress: market.contractAddress,
      position,
    });
    setIsModalOpen(true);
  };

  // ---- existing getMarketData (unchanged) ----
  const getMarketData = (market: (typeof markets)[0], quoteIdx: number) => {
    let yesPercent = 50;
    let yesCost = "0.500";
    let noCost = "0.500";

    if (
      market.marketType === "amm" &&
      market.rYes !== undefined &&
      market.rNo !== undefined
    ) {
      const totalReserves = market.rYes + market.rNo;
      if (totalReserves > 0n) {
        yesPercent = (Number(market.rNo) / Number(totalReserves)) * 100;

        const hasYesQuote =
          yesQuotes &&
          yesQuotes[quoteIdx] &&
          yesQuotes[quoteIdx].status === "success" &&
          yesQuotes[quoteIdx].result;
        const hasNoQuote =
          noQuotes &&
          noQuotes[quoteIdx] &&
          noQuotes[quoteIdx].status === "success" &&
          noQuotes[quoteIdx].result;

        if (hasYesQuote) {
          // Quote returns tuple: (oppIn, wstInFair, p0_num, p0_den, p1_num, p1_den)
          // Per PAMM.sol quoteBuyYes (lines 905-937)
          const yesQuote = yesQuotes![quoteIdx].result as unknown as readonly [
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
          ];
          // wstInFair (index 1) = path-fair EV charge in wstETH for buying `quoteAmount` YES shares
          // This includes fees (10 bps pool fee) + optional PMTuning adjustments (lines 429-457)
          const wstInFair = yesQuote[1];
          if (wstInFair > 0n)
            yesCost = (Number(wstInFair) / Number(quoteAmount)).toFixed(3);
        } else yesCost = (yesPercent / 100).toFixed(3);

        if (hasNoQuote) {
          // Independently quote NO shares - Per PAMM.sol quoteBuyNo (lines 939-969)
          // Important: NO price is NOT simply (1 - yesCost) due to fees and spreads
          const noQuote = noQuotes![quoteIdx].result as unknown as readonly [
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
            bigint,
          ];
          const wstInFair = noQuote[1];
          if (wstInFair > 0n)
            noCost = (Number(wstInFair) / Number(quoteAmount)).toFixed(3);
        } else noCost = ((100 - yesPercent) / 100).toFixed(3);
      }
    } else {
      const totalSupply = market.yesSupply + market.noSupply;
      if (totalSupply > 0n) {
        yesPercent = (Number(market.yesSupply) / Number(totalSupply)) * 100;
        yesCost = (yesPercent / 100).toFixed(3);
        noCost = ((100 - yesPercent) / 100).toFixed(3);
      }
    }

    return { yesPercent, yesCost, noCost };
  };

  // Totals
  const totalPot = markets.reduce((sum, m) => sum + m.pot, 0n);
  const currentAmount = currentBidAmount || 0n;

  // Calculate time remaining for countdown
  const getTimeRemaining = () => {
    if (!officialDeadline || officialDeadline === 0n) return null;

    const deadlineMs = Number(officialDeadline) * 1000;
    const remaining = deadlineMs - currentTime;

    if (remaining <= 0) return { expired: true };

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    return { expired: false, days, hours, minutes };
  };

  const timeRemaining = getTimeRemaining();

  // Build a quick lookup for bets by marketId
  const betByMarketId = useMemo(() => {
    const map = new Map<bigint, { amount?: bigint; deadline?: bigint }>();
    if (betsData) {
      markets.forEach((m, i) => {
        const entry = betsData[i];
        if (entry?.status === "success" && entry.result) {
          const [amount, deadline] = entry.result as unknown as [
            bigint,
            bigint,
          ];
          map.set(m.marketId, { amount, deadline });
        } else {
          map.set(m.marketId, {});
        }
      });
    }
    return map;
  }, [betsData, markets]);

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-lg max-w-4xl mx-auto">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-start gap-3 sm:gap-4">
            <img
              src={MEGAETH_LOGO}
              alt="MegaETH"
              className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  MegaETH public sale total commitments?
                </h2>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors flex-shrink-0"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="max-w-sm bg-zinc-900 dark:bg-zinc-800 text-zinc-100 p-4"
                  >
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-semibold mb-1">
                          How PAMM trading works:
                        </p>
                        <p className="text-zinc-300">
                          This is a prediction market where YES/NO shares split
                          a prize pot, not fixed $1 payouts.
                        </p>
                      </div>

                      <div>
                        <p className="font-semibold mb-1">
                          Your payout if you win:
                        </p>
                        <p className="text-zinc-300">
                          Total pot ÷ Winning shares held by all users
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                          You profit if your average entry cost per share is
                          below the final payout per share.
                        </p>
                      </div>

                      <div>
                        <p className="font-semibold mb-1">Key features:</p>
                        <ul className="text-zinc-300 text-xs space-y-1 list-disc list-inside">
                          <li>Prices shown include 0.1% pool fee</li>
                          <li>Buy low, sell high before close to lock gains</li>
                          <li>Late trading may have additional fees</li>
                        </ul>
                      </div>

                      <div className="pt-2 border-t border-zinc-700">
                        <p className="text-xs text-zinc-400">
                          💡 Tip: Check the quote before trading to see your
                          exact cost and price impact
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Countdown Timer */}
              {timeRemaining && (
                <div className="mb-3 inline-flex items-center gap-1.5 sm:gap-2 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border border-orange-200 dark:border-orange-800 rounded-lg px-2.5 py-2 sm:px-4 sm:py-2.5 w-full sm:w-auto">
                  <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                  {timeRemaining.expired ? (
                    <span className="font-bold text-xs sm:text-sm text-orange-900 dark:text-orange-200">
                      Trading Closed
                    </span>
                  ) : (
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-medium text-orange-700 dark:text-orange-300 flex-shrink-0">
                        Closes in:
                      </span>
                      <div className="flex items-center gap-1 sm:gap-1.5 font-mono font-bold text-orange-900 dark:text-orange-100 text-xs sm:text-sm">
                        {(timeRemaining.days ?? 0) > 0 && (
                          <span className="bg-orange-200 dark:bg-orange-900 px-1.5 py-0.5 sm:px-2 rounded">
                            {timeRemaining.days}d
                          </span>
                        )}
                        <span className="bg-orange-200 dark:bg-orange-900 px-1.5 py-0.5 sm:px-2 rounded">
                          {timeRemaining.hours ?? 0}h
                        </span>
                        <span className="bg-orange-200 dark:bg-orange-900 px-1.5 py-0.5 sm:px-2 rounded">
                          {timeRemaining.minutes ?? 0}m
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                <div className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {Number(formatEther(totalPot)).toFixed(3)} wstETH
                  </span>{" "}
                  Total Volume
                </div>

                <div className="text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Current raised:{" "}
                  </span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatUSDT(currentAmount, true)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Outcomes */}
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="hidden sm:block px-6 py-2 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              <div>Outcome (Volume)</div>
              <div className="text-right">% Chance</div>
              <div></div>
              <div></div>
              <div></div>
            </div>
          </div>

          {BETTING_OPTIONS.map((option, idx) => {
            const market = markets.find((m) => {
              const match = m.description.match(/>=\s*(\d+)\s*USDT/);
              if (!match) return false;
              const descAmount = BigInt(match[1]);
              return descAmount === option.amount;
            });

            if (!market) return null;

            // AMM quote index
            const ammMarkets = markets.filter((m) => m.marketType === "amm");
            const quoteIdx = ammMarkets.findIndex(
              (m) => m.marketId === market.marketId,
            );

            const { yesPercent, yesCost, noCost } = getMarketData(
              market,
              quoteIdx,
            );
            const liquidity = market.pot;

            // ---- NEW: compute canResolve from bets() + totalActiveBidAmount + deadline ----
            const bet = betByMarketId.get(market.marketId);
            const threshold = bet?.amount ?? option.amount; // hard fallback to label amount if bets() missing
            const isPastDeadline = !!(
              officialDeadline &&
              officialDeadline > 0n &&
              currentTime >= Number(officialDeadline) * 1000
            );
            const canResolve =
              !market.resolved &&
              (currentAmount >= (threshold ?? 0n) || isPastDeadline);
            const resolveReason =
              currentAmount >= (threshold ?? 0n) ? "threshold" : "deadline";

            // Get user claimable amount for this market
            let userClaimable = 0n;
            if (userMarketsData) {
              const [yesIds, noIds, , , claimables] = userMarketsData;
              // Check if this market exists in user's markets (either YES or NO position)
              const yesIdx = yesIds.findIndex(
                (id: bigint) => id === market.marketId,
              );
              const noIdx = noIds.findIndex(
                (id: bigint) => id === market.marketId,
              );

              if (yesIdx !== -1) {
                userClaimable = claimables[yesIdx];
              } else if (noIdx !== -1) {
                userClaimable = claimables[noIdx];
              }
            }

            return (
              <MegaSaleOptionRow
                key={idx}
                marketId={market.marketId}
                label={option.label}
                liquidity={liquidity}
                yesPercent={yesPercent}
                yesCost={`${yesCost}Ξ`}
                noCost={`${noCost}Ξ`}
                marketType={market.marketType}
                contractAddress={market.contractAddress}
                onTradeClick={(position) =>
                  handleTradeClick(market.marketId, position)
                }
                canResolve={canResolve}
                resolveReason={canResolve ? resolveReason : undefined}
                onResolve={() => handleResolve(market.marketId)}
                isResolving={isResolvingId === market.marketId}
                resolved={market.resolved}
                outcome={(market as any).outcome ?? false}
                userClaimable={userClaimable}
                onClaim={() =>
                  handleClaim(market.marketId, market.contractAddress)
                }
                isClaiming={claimingMarketId === market.marketId}
              />
            );
          })}
        </div>

        <div className="px-4 py-3 sm:px-6 sm:py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 text-center">
            Volume = total wstETH deposited in market (pot). Includes all YES
            and NO purchases. Prices in wstETH per share include 0.1% AMM fee +
            slippage.
          </p>
          <p className="text-[10px] sm:text-xs text-zinc-500 dark:text-zinc-400 text-center font-medium">
            ⚡ Markets resolve early if threshold is reached before deadline, or
            at deadline based on final amount.
          </p>
        </div>
      </div>

      {/* Trade Modal (unchanged) */}
      {selectedMarket && (
        <TradeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          marketId={selectedMarket.marketId}
          marketName={`MegaETH Fundraise`}
          yesSupply={selectedMarket.yesSupply}
          noSupply={selectedMarket.noSupply}
          marketType={selectedMarket.marketType}
          contractAddress={selectedMarket.contractAddress}
          resolver={MegaSalePMResolverAddress}
          initialPosition={selectedMarket.position}
          onTransactionSuccess={() => {
            onTradeSuccess?.();
          }}
        />
      )}
    </>
  );
};
