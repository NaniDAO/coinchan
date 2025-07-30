import { useQuery } from "@tanstack/react-query";
import type { ZCurveSale } from "@/hooks/use-zcurve-sale";

const GET_ZCURVE_SALES = /* GraphQL */ `
  query GetZCurveSales {
    zcurveSales {
      items {
        coinId
        createdAt
        creator
        currentPrice
        deadline
        divisor
        ethEscrow
        feeOrHook
        ethTarget
        lpSupply
        netSold
        percentFunded
        quadCap
        saleCap
        status
        finalization {
          ethLp
          coinLp
          lpMinted
        }
        purchases {
          totalCount
          items {
            buyer
          }
        }
        sells {
          totalCount
          items {
            seller
          }
        }
        coin {
          name
          symbol
          imageUrl
          description
          decimals
        }
      }
    }
  }
`;

interface GraphQLResponse {
  data?: {
    zcurveSales?: {
      items: Sale[];
    };
  };
  errors?: { message?: string }[];
}

export interface Sale extends ZCurveSale {
  // values added by the GraphQL indexer
  purchases?: { totalCount: number; items: { buyer: string }[] };
  sells?: { totalCount: number; items: { seller: string }[] };
  finalization?: {
    ethLp: string;
    coinLp: string;
    lpMinted: string;
  };
}

export const useZCurveSales = () =>
  useQuery<Sale[], Error>({
    queryKey: ["zcurveSales"],
    queryFn: async () => {
      const url = import.meta.env.VITE_INDEXER_URL;
      if (!url) throw new Error("VITE_INDEXER_URL missing");

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);

      try {
        const res = await fetch(`${url}/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: GET_ZCURVE_SALES }),
          signal: ctrl.signal,
        });

        clearTimeout(timer);
        if (!res.ok) {
          // Don't throw on network errors, return cached data if available
          console.error(`Network error fetching sales: ${res.statusText}`);
          throw new Error(res.statusText);
        }

        const json = (await res.json()) as GraphQLResponse;
        if (json.errors?.length) {
          console.error("GraphQL errors:", json.errors);
          throw new Error(json.errors[0]?.message ?? "GraphQL error");
        }
        return json.data?.zcurveSales?.items ?? [];
      } catch (error) {
        clearTimeout(timer);
        // Re-throw to let React Query handle retries
        throw error;
      }
    },
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
    retryDelay: (i) => Math.min(1000 * 2 ** i, 30_000),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
  });
