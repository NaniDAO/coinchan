import { createFileRoute, Link } from "@tanstack/react-router";
import { useDAICOOrg } from "@/hooks/use-daico-org";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft } from "lucide-react";
import { formatEther, type Address } from "viem";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useReadContract } from "wagmi";
import { DAICOOrgHeader } from "@/components/dao/DAICOOrgHeader";
import { DAICOStatsCards } from "@/components/dao/DAICOStatsCards";
import { DAICOPoolChart } from "@/components/dao/DAICOPoolChart";
import { DAICOSalesTab } from "@/components/dao/DAICOSalesTab";
import { DAICOPurchasesTab } from "@/components/dao/DAICOPurchasesTab";
import { DAICOTapTab } from "@/components/dao/DAICOTapTab";
import { DAICOLPsTab } from "@/components/dao/DAICOLPsTab";
import { DAICOTradeCard } from "@/components/dao/DAICOTradeCard";

export const Route = createFileRoute("/orgs/$chainId/$daoAddress")({
    component: OrgPage,
});

// Utility functions
const fmt2 = (n: number) =>
    Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
const fmtETH = (wei: string) =>
    `Ξ${fmt2(parseFloat(formatEther(BigInt(wei))))}`;
const fromEpoch = (s: number) =>
    new Date(s * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function OrgPage() {
    const { daoAddress, chainId: chainIdParam } = Route.useParams();
    const chainId = chainIdParam ? parseInt(chainIdParam) : 1;
    const { data: org, isLoading, error } = useDAICOOrg(daoAddress, chainId);
    const { data: ethUsdPrice } = useEthUsdPrice();

    // Fetch governance data (quorum) from chain
    const { data: quorumBps } = useReadContract({
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
        chainId,
    });

    const chainName =
        chainId === 1
            ? "Mainnet"
            : chainId === 11155111
              ? "Sepolia"
              : `Chain ${chainId}`;
    const explorerUrl =
        chainId === 11155111
            ? "https://sepolia.etherscan.io"
            : "https://etherscan.io";

    if (isLoading) {
        return (
            <div className="container max-w-6xl mx-auto px-4 py-8 space-y-6">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (error || !org) {
        return (
            <div className="container max-w-6xl mx-auto px-4 py-8">
                <Card className="p-12 text-center">
                    <p className="text-destructive font-medium mb-2">
                        Failed to load DAO organization
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {error
                            ? (error as Error).message
                            : "Organization not found"}
                    </p>
                    <Link to="/explore/daicos" className="mt-4">
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to DAICO Sales
                    </Link>
                </Card>
            </div>
        );
    }

    console.log("Org:", org);
    console.log("LPs:", org.lps);
    console.log(
        "Pool ID:",
        org.lps && org.lps.length > 0 ? org.lps[0].poolId : "No LP",
    );

    const hasPool = org.lps && org.lps.length > 0 && org.lps[0]?.poolId;

    return (
        <div className="container max-w-6xl mx-auto px-4 py-8 space-y-6">
            {/* Back Button */}
            <Link
                to="/explore/daicos"
                className="flex flex-row space-x-2 text-xs hover:underline"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                <span>Back to DAICO Sales</span>
            </Link>

            {/* Header */}
            <DAICOOrgHeader
                org={org}
                chainName={chainName}
                explorerUrl={explorerUrl}
                shortenAddress={shortenAddress}
            />

            {/* Stats Overview */}
            <DAICOStatsCards
                stats={{
                    totalSales: org.totalSales,
                    activeSalesCount: org.activeSalesCount,
                    uniqueBuyers: org.uniqueBuyers,
                    totalPurchases: org.totalPurchases,
                }}
                quorumBps={quorumBps}
            />

            {/* Pool Chart & Trade Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex">
                    <DAICOPoolChart
                        poolId={hasPool ? org.lps[0].poolId : undefined}
                        coinSymbol={org.symbol || undefined}
                        ethUsdPrice={ethUsdPrice}
                    />
                </div>
                <div className="flex">
                    <DAICOTradeCard
                        daoAddress={daoAddress}
                        sale={org.sales && org.sales.length > 0 ? org.sales[0] : null}
                        chainId={chainId}
                    />
                </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="sales" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="sales">
                        Sales ({org.sales.length})
                    </TabsTrigger>
                    <TabsTrigger value="purchases">
                        Purchases ({org.purchases.length})
                    </TabsTrigger>
                    {org.tap && (
                        <TabsTrigger value="tap">Tap Mechanism</TabsTrigger>
                    )}
                    {org.lps.length > 0 && (
                        <TabsTrigger value="lps">
                            Liquidity Pools ({org.lps.length})
                        </TabsTrigger>
                    )}
                </TabsList>

                {/* Sales Tab */}
                <TabsContent value="sales">
                    <DAICOSalesTab
                        sales={org.sales}
                        explorerUrl={explorerUrl}
                        fmtETH={fmtETH}
                        fromEpoch={fromEpoch}
                    />
                </TabsContent>

                {/* Purchases Tab */}
                <TabsContent value="purchases">
                    <DAICOPurchasesTab
                        purchases={org.purchases}
                        explorerUrl={explorerUrl}
                        fmtETH={fmtETH}
                        fromEpoch={fromEpoch}
                        shortenAddress={shortenAddress}
                    />
                </TabsContent>

                {/* Tap Tab */}
                {org.tap && (
                    <TabsContent value="tap">
                        <DAICOTapTab
                            tap={org.tap}
                            explorerUrl={explorerUrl}
                            fmtETH={fmtETH}
                            fromEpoch={fromEpoch}
                            shortenAddress={shortenAddress}
                        />
                    </TabsContent>
                )}

                {/* LPs Tab */}
                {org.lps.length > 0 && (
                    <TabsContent value="lps">
                        <DAICOLPsTab
                            lps={org.lps}
                            explorerUrl={explorerUrl}
                            fmtETH={fmtETH}
                            fromEpoch={fromEpoch}
                        />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
