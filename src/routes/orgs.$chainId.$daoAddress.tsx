import { createFileRoute, Link } from "@tanstack/react-router";
import { useDAICOOrg } from "@/hooks/use-daico-org";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, ExternalLink, Users, DollarSign, Droplet, TrendingUp } from "lucide-react";
import { formatEther } from "viem";
import { formatImageURL } from "@/hooks/metadata/coin-utils";
import PoolCandleChart from "@/PoolCandleChart";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";

export const Route = createFileRoute("/orgs/$chainId/$daoAddress")({
  component: OrgPage,
});

const fmt2 = (n: number) => Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
const fmtETH = (wei: string) => `Ξ${fmt2(parseFloat(formatEther(BigInt(wei))))}`;
const fromEpoch = (s: number) =>
  new Date(s * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

function OrgPage() {
  const { daoAddress, chainId: chainIdParam } = Route.useParams();
  const chainId = chainIdParam ? parseInt(chainIdParam) : 1;
  const { data: org, isLoading, error } = useDAICOOrg(daoAddress, chainId);
  const { data: ethUsdPrice } = useEthUsdPrice();

  const chainName = chainId === 1 ? "Mainnet" : chainId === 11155111 ? "Sepolia" : `Chain ${chainId}`;
  const explorerUrl = chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io";

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
          <p className="text-destructive font-medium mb-2">Failed to load DAO organization</p>
          <p className="text-sm text-muted-foreground">{error ? (error as Error).message : "Organization not found"}</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/explore/daicos">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to DAICO Sales
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/explore/daicos">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        {/* DAO Image */}
        <img
          src={formatImageURL(org.image) || "/default_org.png"}
          alt={org.name || "DAO"}
          className="w-16 h-16 rounded-lg object-cover border border-border"
          onError={(e) => {
            e.currentTarget.src = "/default_org.png";
          }}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{org.name || "Unnamed DAO"}</h1>
            <Badge variant="outline">{chainName}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            <span>{org.symbol || shortenAddress(org.id)}</span>
            <span>•</span>
            <a
              href={`${explorerUrl}/address/${org.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors inline-flex items-center gap-1"
            >
              {shortenAddress(org.id)}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {org.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{org.description}</p>}
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{org.totalSales}</div>
              <div className="text-sm text-muted-foreground">Total Sales</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{org.activeSalesCount}</div>
              <div className="text-sm text-muted-foreground">Active Sales</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{org.uniqueBuyers}</div>
              <div className="text-sm text-muted-foreground">Unique Buyers</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Droplet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold">{org.totalPurchases}</div>
              <div className="text-sm text-muted-foreground">Total Purchases</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales ({org.sales.length})</TabsTrigger>
          <TabsTrigger value="purchases">Purchases ({org.purchases.length})</TabsTrigger>
          {org.tap && <TabsTrigger value="tap">Tap Mechanism</TabsTrigger>}
          {org.lps.length > 0 && <TabsTrigger value="lps">Liquidity Pools ({org.lps.length})</TabsTrigger>}
        </TabsList>

        {/* Sales Tab */}
        <TabsContent value="sales" className="space-y-4">
          {org.sales.map((sale, idx) => {
            const progress = BigInt(sale.forAmt) > 0n ? (BigInt(sale.totalSold) * 100n) / BigInt(sale.forAmt) : 0n;
            return (
              <Card key={idx} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">Token Sale #{idx + 1}</h3>
                      <Badge variant={sale.status === "ACTIVE" ? "default" : "secondary"}>{sale.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Created {fromEpoch(sale.createdAt)}
                      {sale.deadline && ` • Deadline: ${fromEpoch(sale.deadline)}`}
                    </p>
                  </div>
                  <a
                    href={`${explorerUrl}/tx/${sale.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    View Tx
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Offering</div>
                    <div className="font-medium">{fmtETH(sale.forAmt)} tokens</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Price</div>
                    <div className="font-medium">{fmtETH(sale.tribAmt)} per token</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Total Raised</div>
                    <div className="font-medium">{fmtETH(sale.totalRaised)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Sold</div>
                    <div className="font-medium">
                      {fmtETH(sale.totalSold)} ({progress.toString()}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Purchases</div>
                    <div className="font-medium">{sale.purchaseCount}</div>
                  </div>
                  {sale.lpBps && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">LP Allocation</div>
                      <div className="font-medium">{sale.lpBps / 100}%</div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          {org.sales.length === 0 && <Card className="p-12 text-center text-muted-foreground">No sales found</Card>}
        </TabsContent>

        {/* Purchases Tab */}
        <TabsContent value="purchases" className="space-y-3">
          {org.purchases.map((purchase) => (
            <Card key={purchase.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <a
                      href={`${explorerUrl}/address/${purchase.buyer}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline inline-flex items-center gap-1"
                    >
                      {shortenAddress(purchase.buyer)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-muted-foreground">bought</span>
                    <span className="font-medium">{fmtETH(purchase.buyAmt)}</span>
                    <span className="text-muted-foreground">for</span>
                    <span className="font-medium">{fmtETH(purchase.payAmt)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{fromEpoch(purchase.timestamp)}</div>
                </div>
                <a
                  href={`${explorerUrl}/tx/${purchase.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                >
                  Tx
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </Card>
          ))}
          {org.purchases.length === 0 && (
            <Card className="p-12 text-center text-muted-foreground">No purchases yet</Card>
          )}
        </TabsContent>

        {/* Tap Tab */}
        {org.tap && (
          <TabsContent value="tap">
            <Card className="p-6">
              <h3 className="font-semibold text-lg mb-4">Tap Mechanism</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Beneficiary (Ops)</div>
                  <a
                    href={`${explorerUrl}/address/${org.tap.ops}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline inline-flex items-center gap-1"
                  >
                    {shortenAddress(org.tap.ops)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Rate Per Second</div>
                  <div className="font-medium">{fmtETH(org.tap.ratePerSec)}/s</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Total Claimed</div>
                  <div className="font-medium">{fmtETH(org.tap.totalClaimed)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Claim Count</div>
                  <div className="font-medium">{org.tap.claimCount}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Last Claim</div>
                  <div className="font-medium">{fromEpoch(org.tap.lastClaim)}</div>
                </div>
              </div>
            </Card>
          </TabsContent>
        )}

        {/* LPs Tab */}
        {org.lps.length > 0 && (
          <TabsContent value="lps" className="space-y-3">
            {org.lps.map((lp, idx) => (
              <Card key={idx} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">Liquidity Pool #{idx + 1}</h3>
                    <p className="text-sm text-muted-foreground mt-1">Initialized {fromEpoch(lp.timestamp)}</p>
                  </div>
                  <a
                    href={`${explorerUrl}/tx/${lp.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                  >
                    View Tx
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Tribute Used</div>
                    <div className="font-medium">{fmtETH(lp.tribUsed)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Token Used</div>
                    <div className="font-medium">{fmtETH(lp.forUsed)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">LP Tokens</div>
                    <div className="font-medium">{fmtETH(lp.liquidity)}</div>
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-sm text-muted-foreground mb-1">Pool ID</div>
                    <div className="font-mono text-sm">{lp.poolId}</div>
                  </div>
                </div>

                {/* Pool Chart */}
                <div className="mt-6 border-t pt-6">
                  <h4 className="font-semibold text-sm mb-4 text-muted-foreground">Pool Price Chart</h4>
                  <PoolCandleChart
                    poolId={lp.poolId}
                    interval="1h"
                    ticker={org.symbol || "TOKEN"}
                    ethUsdPrice={ethUsdPrice}
                  />
                </div>
              </Card>
            ))}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
