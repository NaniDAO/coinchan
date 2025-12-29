import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { DAICOLP } from "@/types/daico";

interface DAICOLPsTabProps {
    lps: DAICOLP[];
    explorerUrl: string;
    fmtETH: (wei: string) => string;
    fromEpoch: (s: number) => string;
}

export function DAICOLPsTab({
    lps,
    explorerUrl,
    fmtETH,
    fromEpoch,
}: DAICOLPsTabProps) {
    return (
        <div className="space-y-3">
            {lps.map((lp, idx) => (
                <Card key={idx} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                        <div>
                            <h3 className="font-semibold text-lg">
                                Liquidity Pool #{idx + 1}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Initialized {fromEpoch(lp.timestamp)}
                            </p>
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
                            <div className="text-sm text-muted-foreground mb-1">
                                Tribute Used
                            </div>
                            <div className="font-medium">
                                {fmtETH(lp.tribUsed)}
                            </div>
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground mb-1">
                                Token Used
                            </div>
                            <div className="font-medium">{fmtETH(lp.forUsed)}</div>
                        </div>
                        <div>
                            <div className="text-sm text-muted-foreground mb-1">
                                LP Tokens
                            </div>
                            <div className="font-medium">
                                {fmtETH(lp.liquidity)}
                            </div>
                        </div>
                        <div className="md:col-span-3">
                            <div className="text-sm text-muted-foreground mb-1">
                                Pool ID
                            </div>
                            <div className="font-mono text-sm">{lp.poolId}</div>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    );
}
