import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { InstantTradeAction } from "@/components/trade/InstantTradeAction";
import { useAccount, useBalance } from "wagmi";
import { mainnet } from "viem/chains";

export function LockedSwapTile({ token }: { token: TokenMetadata }) {
  const { address } = useAccount();
  const { data: userEthBalance } = useBalance({
    address,
    chainId: mainnet.id,
  });

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
