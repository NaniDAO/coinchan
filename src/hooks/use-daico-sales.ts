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
        tap {
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
        lps {
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
  sales: Array<{
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
  tap: {
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
  } | null;
  lps: Array<{
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
    for (const sale of org.sales) {
      sales.push({
        daoAddress: sale.daoAddress,
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
        hasLP: org.lps.some((lp) => lp.daoAddress === sale.daoAddress && lp.tribTkn === sale.tribTkn),
        hasTap: org.tap !== null && org.tap.daoAddress === sale.daoAddress,
        tapRate: org.tap?.ratePerSec || null,
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
