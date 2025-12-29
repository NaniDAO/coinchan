import { Card } from "@/components/ui/card";
import {
    DollarSign,
    TrendingUp,
    Users,
    Droplet,
    Shield,
} from "lucide-react";

interface DAICOStatsCardsProps {
    stats: {
        totalSales: number;
        activeSalesCount: number;
        uniqueBuyers: number;
        totalPurchases: number;
    };
    quorumBps?: number;
}

export function DAICOStatsCards({ stats, quorumBps }: DAICOStatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">
                            {stats.totalSales}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Total Sales
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">
                            {stats.activeSalesCount}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Active Sales
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Users className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">
                            {stats.uniqueBuyers}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Unique Buyers
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="p-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                        <Droplet className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="text-2xl font-bold">
                            {stats.totalPurchases}
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Total Purchases
                        </div>
                    </div>
                </div>
            </Card>

            {quorumBps !== undefined && (
                <Card className="p-4">
                    <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Shield className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="text-2xl font-bold">
                                {(Number(quorumBps) / 100).toFixed(0)}%
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Voting Quorum
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}
