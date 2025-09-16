import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { InstantTradeAction } from "@/components/trade/InstantTradeAction";
import { useBalance } from "wagmi";

export function LockedSwapTile({ token }: { token: TokenMetadata }) {
  const { data: userEthBalance } = useBalance();

  if (!userEthBalance) return null;

  return (
    <InstantTradeAction
      locked={true}
      initialSellToken={{
        ...ETH_TOKEN,
        balance: userEthBalance.value,
      }}
      initialBuyToken={token}
    />
  );
}
