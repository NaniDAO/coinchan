import { Card } from "@/components/ui/card";
import { TrendingUp, Droplet } from "lucide-react";
import { EnhancedPoolChart } from "@/components/EnhancedPoolChart";

interface DAICOPoolChartProps {
    poolId?: string;
    coinSymbol?: string;
    ethUsdPrice?: number;
}

export function DAICOPoolChart({
    poolId,
    coinSymbol,
    ethUsdPrice,
}: DAICOPoolChartProps) {
    if (poolId) {
        return (
            <Card className="p-6 backdrop-blur-xl bg-background/60 border-primary/10 shadow-lg w-full flex flex-col overflow-hidden">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Liquidity Pool Chart
                </h3>
                <div className="flex-1 min-h-0 overflow-hidden">
                    <EnhancedPoolChart
                        poolId={poolId}
                        coinSymbol={coinSymbol || "TOKEN"}
                        ethPrice={ethUsdPrice ? { priceUSD: ethUsdPrice } : undefined}
                    />
                </div>
            </Card>
        );
    }

    return (
        <Card className="p-12 backdrop-blur-xl bg-gradient-to-br from-background/60 via-primary/5 to-background/40 border-primary/20 shadow-lg w-full flex items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-4 text-center">
                <div className="p-4 rounded-full bg-muted/50 backdrop-blur-sm">
                    <Droplet className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                    <h3 className="font-semibold text-lg mb-1">
                        Pool Not Initialized
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-md">
                        The liquidity pool hasn't been created yet. Once the
                        sale concludes and LP is initialized, the price chart
                        will appear here.
                    </p>
                </div>
            </div>
        </Card>
    );
}
