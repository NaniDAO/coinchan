import { ETH_TOKEN, TokenMetadata } from "@/lib/pools";
import { InstantTradeAction } from "@/components/trade/InstantTradeAction";
import { useAccount, useBalance } from "wagmi";
import { mainnet } from "viem/chains";
import React from "react";

function LockedSwapTileBase({ token }: { token: TokenMetadata }) {
  const { address } = useAccount();
  const { data: userEthBalance } = useBalance({
    address,
    chainId: mainnet.id,
  });

  return (
    <InstantTradeAction
      locked={true}
      initialSellToken={{
        ...ETH_TOKEN,
        balance: userEthBalance?.value,
      }}
      initialBuyToken={token}
      useSearchHook={false}
    />
  );
}

export const LockedSwapTile = React.memo(
  LockedSwapTileBase,
  (prevProps, nextProps) =>
    prevProps.token.address === nextProps.token.address && prevProps.token.id === nextProps.token.id,
);
