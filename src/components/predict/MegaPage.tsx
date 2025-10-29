import React, { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { PredictionMarketAddress, PredictionMarketAbi } from "@/constants/PredictionMarket";
import { PredictionAMMAddress, PredictionAMMAbi } from "@/constants/PredictionMarketAMM";
import { MegaSaleMarketCard } from "./MegaSaleMarketCard";
import { MEGASALE_PM_RESOLVER_ADDRESS } from "@/constants/TrustedResolvers";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Heading } from "@/components/ui/typography";
import { ExternalLink } from "lucide-react";

// MegaETH logo
const MEGAETH_LOGO = "https://content.wrappr.wtf/ipfs/bafkreiefdha6ms7w3pdbrgdmsdwny373psbdq5t7oaaoryt3hh7pi7ndmy";

export const MegaPage: React.FC = () => {
  const [start] = React.useState(0);
  const count = 100;

  // Fetch Pari-Mutuel markets
  const {
    data: marketsData,
    isLoading: isLoadingPM,
    refetch: refetchPM,
  } = useReadContract({
    address: PredictionMarketAddress as `0x${string}`,
    abi: PredictionMarketAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
    query: {
      refetchInterval: 15000,
    },
  });

  // Fetch AMM markets
  const {
    data: ammMarketsData,
    isLoading: isLoadingAMM,
    refetch: refetchAMM,
  } = useReadContract({
    address: PredictionAMMAddress as `0x${string}`,
    abi: PredictionAMMAbi,
    functionName: "getMarkets",
    args: [BigInt(start), BigInt(count)],
    query: {
      refetchInterval: 15000,
    },
  });

  const hasPMMarkets = Boolean(marketsData && marketsData[0] && marketsData[0].length > 0);
  const hasAMMMarkets = Boolean(ammMarketsData && ammMarketsData[0] && ammMarketsData[0].length > 0);

  // Parse markets
  const pmMarkets = useMemo(
    () =>
      hasPMMarkets
        ? {
            marketIdsArray: marketsData![0],
            yesSupplies: marketsData![1],
            noSupplies: marketsData![2],
            resolvers: marketsData![3],
            resolved: marketsData![4],
            outcome: marketsData![5],
            pot: marketsData![6],
            payoutPerShare: marketsData![7],
            descs: marketsData![8],
          }
        : null,
    [hasPMMarkets, marketsData],
  );

  const ammMarkets = useMemo(
    () =>
      hasAMMMarkets
        ? {
            marketIdsArray: ammMarketsData![0],
            yesSupplies: ammMarketsData![1],
            noSupplies: ammMarketsData![2],
            resolvers: ammMarketsData![3],
            resolved: ammMarketsData![4],
            outcome: ammMarketsData![5],
            pot: ammMarketsData![6],
            payoutPerShare: ammMarketsData![7],
            descs: ammMarketsData![8],
            rYesArr: ammMarketsData![11],
            rNoArr: ammMarketsData![12],
          }
        : null,
    [hasAMMMarkets, ammMarketsData],
  );

  // Batch read trading status for PM markets
  const marketIds = marketsData?.[0] || [];
  const { data: tradingOpenData } = useReadContracts({
    contracts: marketIds.map((marketId) => ({
      address: PredictionMarketAddress as `0x${string}`,
      abi: PredictionMarketAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: marketIds.length > 0,
    },
  });

  // Batch read trading status for AMM markets
  const ammMarketIds = ammMarketsData?.[0] || [];
  const { data: ammTradingOpenData } = useReadContracts({
    contracts: ammMarketIds.map((marketId) => ({
      address: PredictionAMMAddress as `0x${string}`,
      abi: PredictionAMMAbi,
      functionName: "tradingOpen",
      args: [marketId],
    })),
    query: {
      enabled: ammMarketIds.length > 0,
    },
  });

  // Combine and filter for MegaSale markets only
  const megaSaleMarkets = useMemo(() => {
    const markets: Array<{
      marketId: bigint;
      yesSupply: bigint;
      noSupply: bigint;
      resolver: string;
      resolved: boolean;
      outcome: boolean;
      pot: bigint;
      payoutPerShare: bigint;
      description: string;
      tradingOpen: boolean;
      marketType: "parimutuel" | "amm";
      contractAddress: `0x${string}`;
      rYes?: bigint;
      rNo?: bigint;
    }> = [];

    // Add PM markets
    if (pmMarkets) {
      pmMarkets.marketIdsArray.forEach((marketId, idx) => {
        if (pmMarkets.resolvers[idx].toLowerCase() === MEGASALE_PM_RESOLVER_ADDRESS.toLowerCase()) {
          markets.push({
            marketId,
            yesSupply: pmMarkets.yesSupplies[idx],
            noSupply: pmMarkets.noSupplies[idx],
            resolver: pmMarkets.resolvers[idx],
            resolved: pmMarkets.resolved[idx],
            outcome: pmMarkets.outcome[idx],
            pot: pmMarkets.pot[idx],
            payoutPerShare: pmMarkets.payoutPerShare[idx],
            description: pmMarkets.descs[idx],
            tradingOpen: Boolean(tradingOpenData?.[idx]?.result ?? true),
            marketType: "parimutuel",
            contractAddress: PredictionMarketAddress as `0x${string}`,
          });
        }
      });
    }

    // Add AMM markets
    if (ammMarkets) {
      ammMarkets.marketIdsArray.forEach((marketId, idx) => {
        if (ammMarkets.resolvers[idx].toLowerCase() === MEGASALE_PM_RESOLVER_ADDRESS.toLowerCase()) {
          markets.push({
            marketId,
            yesSupply: ammMarkets.yesSupplies[idx],
            noSupply: ammMarkets.noSupplies[idx],
            resolver: ammMarkets.resolvers[idx],
            resolved: ammMarkets.resolved[idx],
            outcome: ammMarkets.outcome[idx],
            pot: ammMarkets.pot[idx],
            payoutPerShare: ammMarkets.payoutPerShare[idx],
            description: ammMarkets.descs[idx],
            tradingOpen: Boolean(ammTradingOpenData?.[idx]?.result ?? true),
            marketType: "amm",
            contractAddress: PredictionAMMAddress as `0x${string}`,
            rYes: ammMarkets.rYesArr[idx],
            rNo: ammMarkets.rNoArr[idx],
          });
        }
      });
    }

    return markets;
  }, [pmMarkets, ammMarkets, tradingOpenData, ammTradingOpenData]);

  const isLoading = isLoadingPM || isLoadingAMM;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <div className="flex items-center justify-center py-12">
          <LoadingLogo />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4 pt-4">
        <div className="flex items-center justify-center gap-4">
          <img
            src={MEGAETH_LOGO}
            alt="MegaETH"
            className="w-20 h-20 rounded-full border-4 border-stone-300 dark:border-zinc-600 shadow-lg"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <Heading level={2} className="text-4xl font-black text-stone-900 dark:text-zinc-100">
            MegaETH Fundraise Markets
          </Heading>
        </div>
        <p className="text-lg text-stone-600 dark:text-zinc-400 max-w-2xl mx-auto">
          Predict the success of the MegaETH fundraise. Will they reach these ambitious milestones? Markets use an
          automated market maker (AMM) for instant trading and pot-based payouts to winners.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-zinc-800 rounded-full border border-stone-300 dark:border-zinc-700">
          <span className="text-sm text-stone-700 dark:text-zinc-300">Powered by onchain oracle</span>
          <a
            href={`https://etherscan.io/address/${MEGASALE_PM_RESOLVER_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
          >
            View Contract
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* MegaSale Markets */}
      {megaSaleMarkets.length > 0 ? (
        <MegaSaleMarketCard
          markets={megaSaleMarkets}
          onTradeSuccess={() => {
            refetchPM();
            refetchAMM();
          }}
        />
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🚀</div>
          <p className="text-stone-600 dark:text-zinc-400 text-base">No MegaETH markets available yet.</p>
          <p className="text-sm text-stone-500 dark:text-zinc-500 mt-2">
            Check back soon for new betting opportunities!
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-sm text-stone-500 dark:text-zinc-500 space-y-2 pb-8">
        <p>Markets are resolved automatically based on onchain fundraise data</p>
        <a href="/predict" className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1">
          View all prediction markets →
        </a>
      </div>
    </div>
  );
};
