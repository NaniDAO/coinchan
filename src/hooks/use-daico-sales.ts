import { useQuery } from "@tanstack/react-query";
import type { DAICOSaleItem } from "@/types/daico";

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

const GET_DAICO_SALES = `
  query GetDAICOSales {
    daicoOrgs(limit: 100, orderBy: "createdAt", orderDirection: "desc") {
      items {
        id
        chainId
        name
        symbol
        totalSales
        activeSalesCount
        totalPurchases
        uniqueBuyers
        createdAt
        updatedAt
        lastActivityAt
        sales {
          items {
            daoAddress
            tribTkn
            chainId
            forTkn
            tribAmt
            forAmt
            deadline
            totalSold
            totalRaised
            purchaseCount
            lpBps
            maxSlipBps
            feeOrHook
            status
            createdAt
            updatedAt
            txHash
            blockNumber
          }
        }
        tap {
          items {
            daoAddress
            chainId
            ops
            tribTkn
            ratePerSec
            lastClaim
            totalClaimed
            claimCount
            createdAt
            updatedAt
          }
        }
        lps {
          items {
            daoAddress
            tribTkn
            chainId
            tribUsed
            forUsed
            liquidity
            poolId
            timestamp
            txHash
            blockNumber
          }
        }
      }
    }
  }
`;

type DAICOOrgResponse = {
  id: string;
  chainId: number;
  name: string | null;
  symbol: string | null;
  totalSales: number;
  activeSalesCount: number;
  totalPurchases: number;
  uniqueBuyers: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  sales: {
    items: Array<{
      daoAddress: string;
      tribTkn: string;
      chainId: number;
      forTkn: string;
      tribAmt: string;
      forAmt: string;
      deadline: string | null;
      totalSold: string;
      totalRaised: string;
      purchaseCount: number;
      lpBps: number | null;
      maxSlipBps: number | null;
      feeOrHook: string | null;
      status: string;
      createdAt: string;
      updatedAt: string;
      txHash: string;
      blockNumber: string;
    }>;
  };
  tap: {
    items: Array<{
      daoAddress: string;
      chainId: number;
      ops: string;
      tribTkn: string;
      ratePerSec: string;
      lastClaim: string;
      totalClaimed: string;
      claimCount: number;
      createdAt: string;
      updatedAt: string;
    }>;
  };
  lps: {
    items: Array<{
      daoAddress: string;
      tribTkn: string;
      chainId: number;
      tribUsed: string;
      forUsed: string;
      liquidity: string;
      poolId: string;
      timestamp: string;
      txHash: string;
      blockNumber: string;
    }>;
  };
};

type GetDAICOSalesResponse = {
  data?: {
    daicoOrgs: {
      items: DAICOOrgResponse[];
    };
  };
  errors?: Array<{ message: string }>;
};

async function fetchDAICOSales(): Promise<DAICOSaleItem[]> {
  const response = await fetch(`${INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: GET_DAICO_SALES }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as GetDAICOSalesResponse;

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  const orgs = result.data?.daicoOrgs.items || [];

  // Flatten sales from all orgs into a single list
  const sales: DAICOSaleItem[] = [];

  for (const org of orgs) {
    const orgSales = org.sales.items || [];
    const orgTap = org.tap.items?.[0] || null; // Get first tap if exists
    const orgLps = org.lps.items || [];

    for (const sale of orgSales) {
      sales.push({
        daoAddress: sale.daoAddress,
        chainId: sale.chainId,
        daoName: org.name,
        daoSymbol: org.symbol,
        tribTkn: sale.tribTkn,
        forTkn: sale.forTkn,
        tribAmt: sale.tribAmt,
        forAmt: sale.forAmt,
        deadline: sale.deadline ? parseInt(sale.deadline) : null,
        totalSold: sale.totalSold,
        totalRaised: sale.totalRaised,
        purchaseCount: sale.purchaseCount,
        status: sale.status as "ACTIVE" | "EXPIRED" | "SOLD_OUT" | "CANCELLED",
        createdAt: parseInt(sale.createdAt),
        updatedAt: parseInt(sale.updatedAt),
        lpBps: sale.lpBps,
        feeOrHook: sale.feeOrHook,
        hasLP: orgLps.some((lp) => lp.daoAddress === sale.daoAddress && lp.tribTkn === sale.tribTkn),
        hasTap: orgTap !== null && orgTap.daoAddress === sale.daoAddress,
        tapRate: orgTap?.ratePerSec || null,
        totalPurchases: org.totalPurchases,
        uniqueBuyers: org.uniqueBuyers,
      });
    }
  }

  return sales;
}

export function useDAICOSales() {
  return useQuery({
    queryKey: ["daico-sales"],
    queryFn: fetchDAICOSales,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}
