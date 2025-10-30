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
import { Calendar } from "lucide-react";
import { formatEther } from "viem";
import { TradeModal } from "./TradeModal";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { toast } from "sonner";
import { isUserRejectionError } from "@/lib/errors";

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
  onResolve,
  isResolving = false,
  resolved = false,
  outcome = false,
  userClaimable = 0n,
  onClaim,
  isClaiming = false,
}) => {
  const { address } = useAccount();

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
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-4 px-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
      <div>
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
          <div className="mt-1 inline-flex items-center gap-2 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Holding
            {hasYes && (
              <span className="font-mono">
                &nbsp;YES {Number(formatEther(yesBal!)).toFixed(4)}
              </span>
            )}
            {hasNo && (
              <span className="font-mono">
                &nbsp;NO {Number(formatEther(noBal!)).toFixed(4)}
              </span>
            )}
          </div>
        )}

        {canClaim && (
          <div className="mt-1 inline-flex items-center gap-2 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200 px-2 py-1 text-[11px] font-semibold">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Claimable: {Number(formatEther(userClaimable)).toFixed(4)} wstETH
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
        <div className="col-span-2 flex justify-end">
          <Button
            onClick={onClaim}
            disabled={isClaiming}
            className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold px-6 py-2 h-auto rounded-md shadow-md hover:shadow-lg transition-all"
            size="sm"
          >
            {isClaiming ? "Claiming..." : `Claim ${Number(formatEther(userClaimable)).toFixed(4)} wstETH`}
          </Button>
        </div>
      ) : resolved ? (
        // Show resolved state for markets without claimable winnings
        <div className="col-span-2 flex justify-end">
          <Button
            disabled
            variant="outline"
            className="px-4 py-2 h-auto text-zinc-500"
            size="sm"
          >
            Resolved
          </Button>
        </div>
      ) : canResolve ? (
        // Show resolve button when threshold is met
        <div className="col-span-2 flex justify-end">
          <Button
            onClick={onResolve}
            disabled={isResolving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 h-auto rounded-md shadow-sm transition-all"
            size="sm"
          >
            {isResolving ? "Resolving..." : "Resolve"}
          </Button>
        </div>
      ) : (
        // Show trading buttons for active markets
        <>
          <Button
            onClick={() => onTradeClick("yes")}
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
            onClick={() => onTradeClick("no")}
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
    </div>
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
  const [selectedMarket, setSelectedMarket] = useState<{
    marketId: bigint;
    yesSupply: bigint;
    noSupply: bigint;
    marketType: "parimutuel" | "amm";
    contractAddress: `0x${string}`;
    position: "yes" | "no";
  } | null>(null);

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

  // Fetch user claimable amounts for all markets
  const { data: userClaimableData } = useReadContracts({
    contracts: markets.map((m) => ({
      address: m.contractAddress,
      abi: PredictionAMMAbi,
      functionName: "getUserMarket",
      args: address ? [m.marketId, address] : undefined,
    })),
    query: {
      enabled: !!address && markets.length > 0,
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
      const errorMessage = (claimError as any)?.shortMessage ?? claimError?.message ?? "";
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
        {/* Header (unchanged) */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-start gap-4">
            <img
              src={MEGAETH_LOGO}
              alt="MegaETH"
              className="w-12 h-12 rounded-lg flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                MegaETH public sale total commitments?
              </h2>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-zinc-600 dark:text-zinc-400">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {Number(formatEther(totalPot)).toFixed(3)} wstETH
                  </span>{" "}
                  Total Volume
                </div>
                {officialDeadline !== undefined && officialDeadline > 0n && (
                  <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>
                      {new Date(
                        Number(officialDeadline) * 1000,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 text-sm">
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

        {/* Outcomes */}
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="px-2 py-2 bg-zinc-50 dark:bg-zinc-900/50">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              <div>Outcome (Volume)</div>
              <div className="text-right">% Chance</div>
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

            // ---- NEW: compute canResolve from bets() + totalActiveBidAmount ----
            const bet = betByMarketId.get(market.marketId);
            const threshold = bet?.amount ?? option.amount; // hard fallback to label amount if bets() missing
            const canResolve =
              !market.resolved && currentAmount >= (threshold ?? 0n);

            // Get user claimable amount for this market
            const marketIdx = markets.findIndex((m) => m.marketId === market.marketId);
            const userMarketData = userClaimableData?.[marketIdx];
            let userClaimable = 0n;
            if (userMarketData?.status === "success" && userMarketData.result) {
              const result = userMarketData.result as unknown as readonly [bigint, bigint, bigint];
              userClaimable = result[2]; // claimable is third element
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
                onResolve={() => handleResolve(market.marketId)}
                isResolving={isResolvingId === market.marketId}
                resolved={market.resolved}
                outcome={(market as any).outcome ?? false}
                userClaimable={userClaimable}
                onClaim={() => handleClaim(market.marketId, market.contractAddress)}
                isClaiming={claimingMarketId === market.marketId}
              />
            );
          })}
        </div>

        <div className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
            Volume = total wstETH deposited in market (pot). Includes all YES
            and NO purchases. Prices in wstETH per share include 0.1% AMM fee +
            slippage.
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center font-medium">
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
