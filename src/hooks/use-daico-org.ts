import { useQuery } from "@tanstack/react-query";
import type { DAICOOrg } from "@/types/daico";

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

const GET_DAICO_ORG = `
  query GetDAICOOrg($daoAddress: String!, $chainId: Float!) {
    daicoOrg(id: $daoAddress, chainId: $chainId) {
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
      image
      description
      contractURI
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
      purchases {
        items {
          id
          chainId
          daoAddress
          tribTkn
          buyer
          payAmt
          forTkn
          buyAmt
          timestamp
          txHash
          blockNumber
          logIndex
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
  image: string | null;
  description: string | null;
  contractURI: string | null;
  sales?: {
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
  } | null;
  purchases?: {
    items: Array<{
      id: string;
      chainId: number;
      daoAddress: string;
      tribTkn: string;
      buyer: string;
      payAmt: string;
      forTkn: string;
      buyAmt: string;
      timestamp: string;
      txHash: string;
      blockNumber: string;
      logIndex: number;
    }>;
  } | null;
  tap?: {
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
  } | null;
  lps?: {
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
  } | null;
};

type GetDAICOOrgResponse = {
  data?: {
    daicoOrg: DAICOOrgResponse | null;
  };
  errors?: Array<{ message: string }>;
};

async function fetchDAICOOrg(daoAddress: string, chainId: number): Promise<DAICOOrg | null> {
  const response = await fetch(`${INDEXER_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: GET_DAICO_ORG,
      variables: { daoAddress, chainId },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as GetDAICOOrgResponse;

  // Log errors but don't throw - we can still display partial data
  if (result.errors) {
    console.warn("GraphQL query returned partial errors:", result.errors);
  }

  const org = result.data?.daicoOrg;

  if (!org) {
    return null;
  }

  return {
    id: org.id,
    chainId: org.chainId,
    name: org.name,
    symbol: org.symbol,
    totalSales: org.totalSales,
    activeSalesCount: org.activeSalesCount,
    totalPurchases: org.totalPurchases,
    uniqueBuyers: org.uniqueBuyers,
    createdAt: parseInt(org.createdAt),
    updatedAt: parseInt(org.updatedAt),
    lastActivityAt: org.lastActivityAt ? parseInt(org.lastActivityAt) : null,
    image: org.image,
    description: org.description,
    contractURI: org.contractURI,
    sales: (org.sales?.items || []).map((sale) => ({
      daoAddress: sale.daoAddress,
      tribTkn: sale.tribTkn,
      chainId: sale.chainId,
      forTkn: sale.forTkn,
      tribAmt: sale.tribAmt,
      forAmt: sale.forAmt,
      deadline: sale.deadline ? parseInt(sale.deadline) : null,
      totalSold: sale.totalSold,
      totalRaised: sale.totalRaised,
      purchaseCount: sale.purchaseCount,
      lpBps: sale.lpBps,
      maxSlipBps: sale.maxSlipBps,
      feeOrHook: sale.feeOrHook,
      status: sale.status as "ACTIVE" | "EXPIRED" | "SOLD_OUT" | "CANCELLED",
      createdAt: parseInt(sale.createdAt),
      updatedAt: parseInt(sale.updatedAt),
      txHash: sale.txHash,
      blockNumber: parseInt(sale.blockNumber),
    })),
    purchases: (org.purchases?.items || []).map((purchase) => ({
      id: purchase.id,
      chainId: purchase.chainId,
      daoAddress: purchase.daoAddress,
      tribTkn: purchase.tribTkn,
      buyer: purchase.buyer,
      payAmt: purchase.payAmt,
      forTkn: purchase.forTkn,
      buyAmt: purchase.buyAmt,
      timestamp: parseInt(purchase.timestamp),
      txHash: purchase.txHash,
      blockNumber: parseInt(purchase.blockNumber),
      logIndex: purchase.logIndex,
    })),
    tap:
      org.tap?.items && org.tap.items.length > 0
        ? {
            daoAddress: org.tap.items[0].daoAddress,
            chainId: org.tap.items[0].chainId,
            ops: org.tap.items[0].ops,
            tribTkn: org.tap.items[0].tribTkn,
            ratePerSec: org.tap.items[0].ratePerSec,
            lastClaim: parseInt(org.tap.items[0].lastClaim),
            totalClaimed: org.tap.items[0].totalClaimed,
            claimCount: org.tap.items[0].claimCount,
            createdAt: parseInt(org.tap.items[0].createdAt),
            updatedAt: parseInt(org.tap.items[0].updatedAt),
          }
        : null,
    lps: (org.lps?.items || []).map((lp) => ({
      daoAddress: lp.daoAddress,
      tribTkn: lp.tribTkn,
      chainId: lp.chainId,
      tribUsed: lp.tribUsed,
      forUsed: lp.forUsed,
      liquidity: lp.liquidity,
      poolId: lp.poolId,
      timestamp: parseInt(lp.timestamp),
      txHash: lp.txHash,
      blockNumber: parseInt(lp.blockNumber),
    })),
  };
}

export function useDAICOOrg(daoAddress: string | undefined, chainId: number = 1) {
  return useQuery({
    queryKey: ["daico-org", daoAddress, chainId],
    queryFn: () => fetchDAICOOrg(daoAddress!, chainId),
    enabled: !!daoAddress,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}
