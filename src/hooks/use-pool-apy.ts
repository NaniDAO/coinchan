import { CoinSource } from "@/lib/coins";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";

const DECIMALS = 18;
const toEth = (raw: bigint, isEth: boolean, px0: number) => Number(formatUnits(raw, DECIMALS)) / (isEth ? 1 : px0);

export const usePoolApy = (poolId?: string, source?: CoinSource) => {
  // Normalize source: undefined/null defaults to "ZAMM" to match GraphQL query behavior
  const normalizedSource = source || "ZAMM";

  return useQuery({
    queryKey: ["pool-apy", poolId, normalizedSource],
    queryFn: async () => {
      const numDays = 30;
      const timestamp_gte = Math.floor(Date.now() / 1000) - numDays * 24 * 60 * 60;
      const response = await fetch(`${import.meta.env.VITE_INDEXER_URL}/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
              query GetSwapAmounts {
                pool(id: "${poolId}", source: "${normalizedSource}", chainId: 1) {
                  reserve0,
                  reserve1,
                  price0,
                  swapFee,
                  token0,
                  token1
                }
                swaps(
                  where: {poolId: "${poolId}", source: ${normalizedSource}, timestamp_gte: "${timestamp_gte}"},
                  limit: 1000
                ) {
                  items {
                    amount0In
                    amount1In
                  }
                }
              }
            `,
        }),
      });

      const data = await response.json();

      // Check for GraphQL errors
      if (data.errors) {
        console.error("GraphQL errors in usePoolApy:", data.errors);
        return "0.000000%";
      }

      if (!data.data) {
        return "0.000000%";
      }

      const { pool, swaps } = data.data;

      // If no pool data, return 0%
      if (!pool) {
        return "0.000000%";
      }

      // all tokens assumed 18 decimals
      const DECIMALS = 18;
      const px0 = Number(formatUnits(BigInt(pool.price0), DECIMALS)); // token1 per ETH

      const tvlEth = toEth(BigInt(pool.reserve0), true, px0) + toEth(BigInt(pool.reserve1), false, px0);

      let grossFeeEth = 0;
      // Handle case where swaps might be null or items might be empty
      const swapItems = swaps?.items || [];
      for (const r of swapItems) {
        const in0 = BigInt(r.amount0In ?? 0n);
        const in1 = BigInt(r.amount1In ?? 0n);

        if (in0 > 0n) {
          grossFeeEth += toEth(in0, true, px0) * (pool.swapFee / 10_000);
        } else if (in1 > 0n) {
          grossFeeEth += toEth(in1, false, px0) * (pool.swapFee / 10_000);
        }
      }

      const lpFeeEth = grossFeeEth;

      const apy = Math.pow(1 + lpFeeEth / tvlEth, 365 / numDays) - 1;

      return (apy * 100).toFixed(6) + "%";
    },
    enabled: !!poolId,
  });
};
