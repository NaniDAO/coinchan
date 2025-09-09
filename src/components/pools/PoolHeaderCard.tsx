import { TokenMetadata } from "@/lib/pools";
import { ProtocolId, protocols } from "@/lib/protocol";
import { Badge } from "../ui/badge";
import { formatPrice } from "@/lib/math";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { useMemo } from "react";
import { zeroAddress } from "viem";

interface PoolHeaderCardProps {
  tokenA: TokenMetadata;
  tokenB: TokenMetadata;
  protocolId: ProtocolId;
  marketPrice: number | undefined;
  feeLabel: string;
}

export const PoolHeaderCard = ({ tokenA, tokenB, protocolId, marketPrice, feeLabel }: PoolHeaderCardProps) => {
  const { data: ethUsdPrice } = useEthUsdPrice();

  const usdMarketPrice = useMemo(() => {
    if (!ethUsdPrice || !marketPrice) return undefined;
    if (tokenA.address === zeroAddress && tokenA.id === 0n) {
      return marketPrice * ethUsdPrice;
    }
    return null;
  }, [ethUsdPrice, marketPrice]);

  return (
    <div className="rounded-lg border-2 p-4 bg-background">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="text-base font-medium">
            {tokenA?.symbol ?? "TokenA"} / {tokenB?.symbol ?? "TokenB"}
          </div>
          <Badge variant="fees">{feeLabel}</Badge>
        </div>
        <Badge variant="secondary">{protocols.find((p) => p.id === protocolId)?.label ?? protocolId}</Badge>
      </div>
      <div className="mt-1 text-sm text-muted-foreground">
        Market price:&nbsp;
        {marketPrice
          ? `${formatPrice(marketPrice)} ${tokenA?.symbol ?? "TokenA"} = 1 ${tokenB?.symbol ?? "TokenB"} ${usdMarketPrice ? " = " + formatPrice(usdMarketPrice) + "USD" : ""}`
          : "-"}
      </div>
    </div>
  );
};
