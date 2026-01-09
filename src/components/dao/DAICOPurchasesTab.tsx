import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { DAICOPurchase } from "@/types/daico";

interface DAICOPurchasesTabProps {
  purchases: DAICOPurchase[];
  explorerUrl: string;
  fmtETH: (wei: string) => string;
  fromEpoch: (s: number) => string;
  shortenAddress: (addr: string) => string;
}

export function DAICOPurchasesTab({
  purchases,
  explorerUrl,
  fmtETH,
  fromEpoch,
  shortenAddress,
}: DAICOPurchasesTabProps) {
  if (purchases.length === 0) {
    return <Card className="p-12 text-center text-muted-foreground">No purchases yet</Card>;
  }

  return (
    <div className="space-y-3">
      {purchases.map((purchase) => (
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
    </div>
  );
}
