import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import type { DAICOTap } from "@/types/daico";

interface DAICOTapTabProps {
    tap: DAICOTap;
    explorerUrl: string;
    fmtETH: (wei: string) => string;
    fromEpoch: (s: number) => string;
    shortenAddress: (addr: string) => string;
}

export function DAICOTapTab({
    tap,
    explorerUrl,
    fmtETH,
    fromEpoch,
    shortenAddress,
}: DAICOTapTabProps) {
    return (
        <Card className="p-6">
            <h3 className="font-semibold text-lg mb-4">Tap Mechanism</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <div className="text-sm text-muted-foreground mb-1">
                        Beneficiary (Ops)
                    </div>
                    <a
                        href={`${explorerUrl}/address/${tap.ops}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline inline-flex items-center gap-1"
                    >
                        {shortenAddress(tap.ops)}
                        <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground mb-1">
                        Rate Per Second
                    </div>
                    <div className="font-medium">{fmtETH(tap.ratePerSec)}/s</div>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground mb-1">
                        Total Claimed
                    </div>
                    <div className="font-medium">
                        {fmtETH(tap.totalClaimed)}
                    </div>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground mb-1">
                        Claim Count
                    </div>
                    <div className="font-medium">{tap.claimCount}</div>
                </div>
                <div>
                    <div className="text-sm text-muted-foreground mb-1">
                        Last Claim
                    </div>
                    <div className="font-medium">
                        {fromEpoch(tap.lastClaim)}
                    </div>
                </div>
            </div>
        </Card>
    );
}
