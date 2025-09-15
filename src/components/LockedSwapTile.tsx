import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { InstantTradeAction } from "@/components/trade/InstantTradeAction";

export function LockedSwapTile({ token }: { token: TokenMetadata }) {
  console.log("LockedSwapTile Token:", token);
  return (
    <InstantTradeAction
      locked={true}
      initialSellToken={ETH_TOKEN}
      initialBuyToken={token}
    />
  );
}
