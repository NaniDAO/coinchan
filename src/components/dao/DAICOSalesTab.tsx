import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { DAICOSale } from "@/types/daico";

interface DAICOSalesTabProps {
  sales: DAICOSale[];
  explorerUrl: string;
  fmtETH: (wei: string) => string;
  fromEpoch: (s: number) => string;
}

export function DAICOSalesTab({ sales, explorerUrl, fmtETH, fromEpoch }: DAICOSalesTabProps) {
  if (sales.length === 0) {
    return <Card className="p-12 text-center text-muted-foreground">No sales found</Card>;
  }

  return (
    <div className="space-y-4">
      {sales.map((sale, idx) => {
        // Use totalRaised (payment received) vs forAmt (payment target)
        const progressCalc = BigInt(sale.forAmt) > 0n ? (BigInt(sale.totalRaised) * 100n) / BigInt(sale.forAmt) : 0n;
        // Cap at 100 to handle edge cases
        const progress = progressCalc > 100n ? 100n : progressCalc;

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
                  {fmtETH(sale.totalSold)} ({progress.toString()}
                  %)
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
    </div>
  );
}
