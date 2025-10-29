import React, { useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
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
}

export const MegaSaleOptionRow: React.FC<MegaSaleOptionRowProps> = ({
  marketId,
  label,
  liquidity,
  yesPercent,
  yesCost,
  noCost,
  onTradeClick,
}) => {
  const { address } = useAccount();

  const { data: noId } = useReadContract({
    address: PredictionAMMAddress,
    abi: PredictionAMMAbi,
    functionName: "getNoId",
    args: [marketId],
  });

  // User YES balance (token id = marketId)
  const { data: yesBal } = useTokenBalance({
    token: {
      id: marketId,
      address: PredictionAMMAddress,
    },
    address,
  });

  // User NO balance (token id = noId)
  const { data: noBal } = useTokenBalance({
    token: {
      id: noId ?? 0n,
      address: PredictionAMMAddress,
    },
    address,
  });

  const hasYes = (yesBal ?? 0n) > 0n;
  const hasNo = (noBal ?? 0n) > 0n;
  const hasPosition = hasYes || hasNo;

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-4 px-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-lg transition-colors border-b border-zinc-200 dark:border-zinc-800 last:border-b-0">
      {/* Outcome label, volume, and holding indicator */}
      <div>
        <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {label}
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
      </div>

      {/* Percentage chance - large and prominent */}
      <div className="text-right">
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {yesPercent.toFixed(2)}%
        </div>
        <div className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
          chance
        </div>
      </div>

      {/* Buy Yes button */}
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

      {/* Buy No button */}
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
    </div>
  );
};

interface MegaSaleMarketCardProps {
  markets: Array<{
    marketId: bigint;
    yesSupply: bigint;
    noSupply: bigint;
    resolved: boolean;
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<{
    marketId: bigint;
    yesSupply: bigint;
    noSupply: bigint;
    marketType: "parimutuel" | "amm";
    contractAddress: `0x${string}`;
    position: "yes" | "no";
  } | null>(null);

  // Fetch current bid amount from MegaSalePM
  const { data: currentBidAmount } = useReadContract({
    address: MegaSalePMResolverAddress as `0x${string}`,
    abi: MegaSalePMResolverAbi,
    functionName: "totalActiveBidAmount",
    query: {
      refetchInterval: 15000, // Refresh every 15 seconds
    },
  });

  // Fetch official deadline
  const { data: officialDeadline } = useReadContract({
    address: MegaSalePMResolverAddress as `0x${string}`,
    abi: MegaSalePMResolverAbi,
    functionName: "closeAuctionAtTimestamp",
    query: {
      refetchInterval: 60000, // Refresh every minute
    },
  });

  // Fetch quotes for buying shares to show accurate prices
  // Quote for 1 full share (1e18 share units) to get cost per share in wstETH
  // Per PAMM.sol quoteBuyYes: wstInFair = wstETH cost for buying `yesOut` shares
  const quoteAmount = 1000000000000000000n; // 1.0 share (1e18 share units)
  const ammMarkets = markets.filter((m) => m.marketType === "amm");

  // Get YES quotes - returns (oppIn, wstInFair, p0_num, p0_den, p1_num, p1_den)
  const { data: yesQuotes } = useReadContracts({
    contracts: ammMarkets.map((market) => ({
      address: market.contractAddress,
      abi: PredictionAMMAbi,
      functionName: "quoteBuyYes",
      args: [market.marketId, quoteAmount],
    })),
    query: {
      refetchInterval: 15000,
    },
  });

  // Get NO quotes - independently quoted for accurate spread display
  const { data: noQuotes } = useReadContracts({
    contracts: ammMarkets.map((market) => ({
      address: market.contractAddress,
      abi: PredictionAMMAbi,
      functionName: "quoteBuyNo",
      args: [market.marketId, quoteAmount],
    })),
    query: {
      refetchInterval: 15000,
    },
  });

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

  // Calculate odds and prices for each market
  // Per PAMM.sol (lines 896-901): impliedYesProb = rNo / (rYes + rNo)
  // Prices are from path-fair EV charge via Simpson's rule (fee-aware, lines 321-376)
  // Note: PAMM uses pot-based payouts (not fixed $1 per share like Polymarket)
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
        // Implied YES probability from AMM reserves (PAMM.sol line 897: return (rNo, rYes + rNo))
        // YES probability = rNo / (rYes + rNo)
        yesPercent = (Number(market.rNo) / Number(totalReserves)) * 100;

        // Get actual prices from quotes (not just probability)
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
          if (wstInFair > 0n) {
            // Cost per share = wstInFair / quoteAmount = wstETH per share
            // Example: if wstInFair = 0.65e18 for 1e18 shares, then cost = 0.65 wstETH per share
            const yesCostNum = Number(wstInFair) / Number(quoteAmount);
            yesCost = yesCostNum.toFixed(3);
          }
        } else {
          // Fallback to probability-based pricing if quote unavailable
          yesCost = (yesPercent / 100).toFixed(3);
        }

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
          if (wstInFair > 0n) {
            // Cost per NO share = wstInFair / quoteAmount = wstETH per NO share
            // YES + NO prices can sum to > 1.0 due to fees/spread (Polymarket-style bid-ask spread)
            const noCostNum = Number(wstInFair) / Number(quoteAmount);
            noCost = noCostNum.toFixed(3);
          }
        } else {
          // Fallback to probability-based pricing if quote unavailable
          noCost = ((100 - yesPercent) / 100).toFixed(3);
        }
      }
    } else {
      // Parimutuel - use supply ratios for both probability and pricing
      const totalSupply = market.yesSupply + market.noSupply;
      if (totalSupply > 0n) {
        yesPercent = (Number(market.yesSupply) / Number(totalSupply)) * 100;
        yesCost = (yesPercent / 100).toFixed(3);
        noCost = ((100 - yesPercent) / 100).toFixed(3);
      }
    }

    return { yesPercent, yesCost, noCost };
  };

  // Calculate total pot (wstETH) across all markets
  // pot correctly accumulates wstETH from both YES and NO purchases
  const totalPot = markets.reduce((sum, m) => sum + m.pot, 0n);
  const currentAmount = currentBidAmount || 0n;

  return (
    <>
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-lg max-w-4xl mx-auto">
        {/* Header - Polymarket style */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-start gap-4">
            {/* Logo */}
            <img
              src={MEGAETH_LOGO}
              alt="MegaETH"
              className="w-12 h-12 rounded-lg flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />

            <div className="flex-1 min-w-0">
              {/* Market Question */}
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
                MegaETH public sale total commitments?
              </h2>

              {/* Stats row */}
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

              {/* Current progress */}
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

        {/* Outcomes list - Polymarket style */}
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
              // Match market by extracting the amount from description
              // Description format per MegaSalePM.sol line 42: "MegaSale totalActiveBidAmount() >= <amount> USDT by <deadline> Unix epoch time..."
              // Example: "MegaSale totalActiveBidAmount() >= 1000000000000000 USDT by 1735689600 Unix epoch time..."
              const match = m.description.match(/>=\s*(\d+)\s*USDT/);
              if (!match) {
                console.warn(
                  "Failed to parse market description:",
                  m.description,
                );
                return false;
              }
              const descAmount = BigInt(match[1]);
              return descAmount === option.amount;
            });

            if (!market) {
              console.warn(
                `No market found for betting option: ${option.label} (${option.amount})`,
              );
              return null;
            }

            // Find quote index for AMM markets
            const ammMarkets = markets.filter((m) => m.marketType === "amm");
            const quoteIdx = ammMarkets.findIndex(
              (m) => m.marketId === market.marketId,
            );

            const { yesPercent, yesCost, noCost } = getMarketData(
              market,
              quoteIdx,
            );

            // Use pot which tracks total wstETH from both YES and NO purchases
            const liquidity = market.pot;

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
              />
            );
          })}
        </div>

        {/* Footer note */}
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

      {/* Trade Modal */}
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
            if (onTradeSuccess) onTradeSuccess();
          }}
        />
      )}
    </>
  );
};
