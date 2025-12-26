import { createFileRoute, Link } from "@tanstack/react-router";
import { useReadContracts, useReadContract } from "wagmi";
import { DaicoAbi, DaicoAddress } from "@/constants/DAICO";
import { ZORG_RENDERER, ZORG_RENDERER_ABI } from "@/constants/ZORG";
import type { Address } from "viem";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Coins, DollarSign, Droplet, Shield, Calendar } from "lucide-react";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";

export const Route = createFileRoute("/org/$chainId/$daoAddress")({
  component: OrgPage,
});

interface DAOMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
}

function OrgPage() {
  const { chainId, daoAddress } = Route.useParams();
  const { data: ethUsdPrice } = useEthUsdPrice();

  // Fetch DAO metadata from renderer
  const { data: daoURIData } = useReadContract({
    address: ZORG_RENDERER,
    abi: ZORG_RENDERER_ABI,
    functionName: "daoContractURI",
    args: [daoAddress as Address],
  });

  // Parse metadata from URI (IPFS hash)
  const [metadata, setMetadata] = useState<DAOMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);

  React.useEffect(() => {
    if (daoURIData) {
      setMetadataLoading(true);
      // Fetch from IPFS
      const ipfsHash = daoURIData;
      fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`)
        .then((res) => res.json())
        .then((data) => setMetadata(data))
        .catch((err) => console.error("Failed to fetch metadata:", err))
        .finally(() => setMetadataLoading(false));
    }
  }, [daoURIData]);

  // Fetch sale data for ETH (address(0))
  const { data: saleData, isLoading: saleLoading } = useReadContract({
    address: DaicoAddress,
    abi: DaicoAbi,
    functionName: "sales",
    args: [daoAddress as Address, "0x0000000000000000000000000000000000000000" as Address],
  });

  // Fetch LP config
  const { data: lpConfigData } = useReadContract({
    address: DaicoAddress,
    abi: DaicoAbi,
    functionName: "lpConfigs",
    args: [daoAddress as Address, "0x0000000000000000000000000000000000000000" as Address],
  });

  // Fetch tap config
  const { data: tapData } = useReadContract({
    address: DaicoAddress,
    abi: DaicoAbi,
    functionName: "taps",
    args: [daoAddress as Address],
  });

  // Fetch DAO contract data (quorum, name, symbol)
  const { data: daoContractData } = useReadContracts({
    contracts: [
      {
        address: daoAddress as Address,
        abi: [
          {
            inputs: [],
            name: "name",
            outputs: [{ internalType: "string", name: "", type: "string" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "name",
      },
      {
        address: daoAddress as Address,
        abi: [
          {
            inputs: [],
            name: "symbol",
            outputs: [{ internalType: "string", name: "", type: "string" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "symbol",
      },
      {
        address: daoAddress as Address,
        abi: [
          {
            inputs: [],
            name: "quorumBps",
            outputs: [{ internalType: "uint16", name: "", type: "uint16" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "quorumBps",
      },
    ],
  });

  const isLoading = saleLoading || metadataLoading;

  if (isLoading) {
    return <OrgPageSkeleton />;
  }

  // Parse sale data
  const sale = saleData
    ? {
        tribAmt: saleData[0] as bigint,
        forAmt: saleData[1] as bigint,
        forTkn: saleData[2] as Address,
        deadline: Number(saleData[3]),
      }
    : null;

  const lpConfig = lpConfigData
    ? {
        lpBps: lpConfigData[0] as number,
        maxSlipBps: lpConfigData[1] as number,
        feeOrHook: lpConfigData[2] as bigint,
      }
    : null;

  const tap = tapData
    ? {
        ops: tapData[0] as Address,
        tribTkn: tapData[1] as Address,
        ratePerSec: tapData[2] as bigint,
        lastClaim: Number(tapData[3]),
      }
    : null;

  const orgName = daoContractData?.[0]?.result as string | undefined;
  const orgSymbol = daoContractData?.[1]?.result as string | undefined;
  const quorumBps = daoContractData?.[2]?.result ? Number(daoContractData[2].result) : undefined;

  const hasSale = sale && sale.tribAmt > 0n;
  const hasLP = lpConfig && lpConfig.lpBps > 0;
  const hasTap = tap && tap.ops !== "0x0000000000000000000000000000000000000000";

  // Calculate token price
  const tokenPrice = sale && sale.forAmt > 0n ? Number(sale.tribAmt) / Number(sale.forAmt) : 0;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Link to="/daico" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        Back to DAICO Wizard
      </Link>

      {/* Header */}
      <div className="mb-8">
        <Card className="p-8 bg-gradient-to-br from-primary/5 via-purple-500/5 to-background border-primary/20">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg">
              {metadata?.image ? (
                <img
                  src={metadata.image.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
                  alt={orgName || "DAO"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Coins className="w-10 h-10 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-bold mb-3">{orgName || "DAICO Organization"}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge variant="secondary" className="font-mono text-sm">
                  {orgSymbol || "TKN"}
                </Badge>
                <Badge variant="outline" className="text-sm">
                  Chain {chainId}
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">
                  {daoAddress.slice(0, 6)}...{daoAddress.slice(-4)}
                </Badge>
              </div>
              {metadata?.description && <p className="mt-4 text-muted-foreground">{metadata.description}</p>}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sale Information */}
        {hasSale && (
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <DollarSign className="w-4 h-4 text-primary" />
              </div>
              <h3 className="font-semibold text-lg">Token Sale</h3>
              <Badge variant="secondary" className="ml-auto">
                Active
              </Badge>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Token Price</span>
                <span className="font-semibold">{(tokenPrice * 1e18).toFixed(6)} ETH</span>
              </div>

              {ethUsdPrice && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Price (USD)</span>
                  <span className="font-semibold">
                    $
                    {(tokenPrice * 1e18 * ethUsdPrice).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}
                  </span>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Token Contract</span>
                <span className="font-mono text-xs">
                  {sale.forTkn.slice(0, 6)}...{sale.forTkn.slice(-4)}
                </span>
              </div>

              {sale.deadline > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Sale Deadline</span>
                  <span className="text-sm">{new Date(sale.deadline * 1000).toLocaleDateString()}</span>
                </div>
              )}

              <div className="mt-6">
                <Button className="w-full" size="lg">
                  Buy Tokens
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Governance */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold text-lg">Governance</h3>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Voting Quorum</span>
              <span className="font-semibold">{quorumBps ? (quorumBps / 100).toFixed(0) : "N/A"}%</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">DAO Address</span>
              <span className="font-mono text-xs">
                {daoAddress.slice(0, 6)}...{daoAddress.slice(-4)}
              </span>
            </div>

            <div className="mt-6">
              <Button variant="outline" className="w-full">
                View Proposals
              </Button>
            </div>
          </div>
        </Card>

        {/* LP Config */}
        {hasLP && lpConfig && (
          <Card className="p-6 bg-blue-500/5 border-blue-500/20">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Droplet className="w-4 h-4 text-blue-500" />
              </div>
              <h3 className="font-semibold text-lg">Auto Liquidity Pool</h3>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">LP Allocation</span>
                <span className="font-medium">{(lpConfig.lpBps / 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pool Fee</span>
                <span className="font-medium">{(Number(lpConfig.feeOrHook) / 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Slippage</span>
                <span className="font-medium">{(lpConfig.maxSlipBps / 100).toFixed(1)}%</span>
              </div>
            </div>
          </Card>
        )}

        {/* Tap Config */}
        {hasTap && tap && (
          <Card className="p-6 bg-green-500/5 border-green-500/20">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Calendar className="w-4 h-4 text-green-500" />
              </div>
              <h3 className="font-semibold text-lg">Passive Income</h3>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Operator</span>
                <span className="font-mono text-xs">
                  {tap.ops.slice(0, 6)}...{tap.ops.slice(-4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rate per Day</span>
                <span className="font-medium">{((Number(tap.ratePerSec) * 86400) / 1e18).toFixed(4)} ETH</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Claim</span>
                <span className="text-xs">
                  {tap.lastClaim > 0 ? new Date(tap.lastClaim * 1000).toLocaleDateString() : "Never"}
                </span>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function OrgPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <Skeleton className="h-4 w-32 mb-6" />
      <Card className="p-8 mb-8">
        <div className="flex items-start gap-6">
          <Skeleton className="w-20 h-20 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-10 w-64" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-32" />
            </div>
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

// Need to import React for hooks
import React, { useState } from "react";
