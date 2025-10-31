import { useQuery } from "@tanstack/react-query";

const INDEXER_URL = "https://coinchan-indexer-production.up.railway.app";

export interface MarketVolume {
  marketId: string;
  volume: {
    total: string;
    totalEth: string;
    trade: string;
    tradeEth: string;
    buy: string;
    buyEth: string;
    sell: string;
    sellEth: string;
    claim: string;
    claimEth: string;
  };
  counts: {
    trades: number;
    claims: number;
    total: number;
  };
}

export interface MegaMarketsVolumeData {
  totalVolumeEth: string;
  totalTradeVolumeEth: string;
  totalBuyVolumeEth: string;
  totalSellVolumeEth: string;
  totalClaimVolumeEth: string;
  totalTrades: number;
  totalClaims: number;
  marketVolumes: MarketVolume[];
}

interface UseMegaMarketsVolumeOptions {
  marketIds: bigint[];
  enabled?: boolean;
}

export function useMegaMarketsVolume({
  marketIds,
  enabled = true,
}: UseMegaMarketsVolumeOptions) {
  return useQuery<MegaMarketsVolumeData>({
    queryKey: ["mega-markets-volume", marketIds.map((id) => id.toString()).join(",")],
    queryFn: async () => {
      // Fetch volume for each market ID
      const volumePromises = marketIds.map(async (marketId) => {
        const response = await fetch(
          `${INDEXER_URL}/api/pamm-volume?marketId=${marketId.toString()}`
        );

        if (!response.ok) {
          console.error(`Failed to fetch volume for market ${marketId}`);
          return null;
        }

        return response.json() as Promise<MarketVolume>;
      });

      const volumes = await Promise.all(volumePromises);
      const validVolumes = volumes.filter((v): v is MarketVolume => v !== null);

      // Sum up all volumes
      let totalVolume = 0;
      let totalTradeVolume = 0;
      let totalBuyVolume = 0;
      let totalSellVolume = 0;
      let totalClaimVolume = 0;
      let totalTrades = 0;
      let totalClaims = 0;

      for (const volume of validVolumes) {
        totalVolume += Number.parseFloat(volume.volume.totalEth);
        totalTradeVolume += Number.parseFloat(volume.volume.tradeEth);
        totalBuyVolume += Number.parseFloat(volume.volume.buyEth);
        totalSellVolume += Number.parseFloat(volume.volume.sellEth);
        totalClaimVolume += Number.parseFloat(volume.volume.claimEth);
        totalTrades += volume.counts.trades;
        totalClaims += volume.counts.claims;
      }

      return {
        totalVolumeEth: totalVolume.toFixed(4),
        totalTradeVolumeEth: totalTradeVolume.toFixed(4),
        totalBuyVolumeEth: totalBuyVolume.toFixed(4),
        totalSellVolumeEth: totalSellVolume.toFixed(4),
        totalClaimVolumeEth: totalClaimVolume.toFixed(4),
        totalTrades,
        totalClaims,
        marketVolumes: validVolumes,
      };
    },
    enabled: enabled && marketIds.length > 0,
    staleTime: 60_000, // 60 seconds
  });
}
