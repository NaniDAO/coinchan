import { useQuery } from "@tanstack/react-query";

export const useCoinSale = ({ coinId }: { coinId: string }) => {
  return useQuery({
    queryKey: ["coin-sale", coinId],
    queryFn: async () => {
      const response = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query SaleQuery {
              sales(where: {coinId: "${coinId}"}) {
                items {
                  blockNumber
                  coinId
                  coinsSold
                  createdAt
                  creator
                  deadlineLast
                  ethRaised
                  id
                  saleSupply
                  status
                  tranches {
                    items {
                      coins
                      deadline
                      price
                      remaining
                      trancheIndex
                      sold
                    }
                  }
                }
              }
            }
          `,
        }),
      });

      const json = await response.json();

      // Safely handle missing or empty data
      return json?.data?.sales?.items?.[0] ?? null;
    },
  });
};
