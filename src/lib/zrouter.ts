import { CoinsAddress } from "@/constants/Coins";
import { CookbookAddress } from "@/constants/Cookbook";
import { Address, zeroAddress } from "viem";
import { HARDCODED_ADDR, TokenMeta } from "./coins";
import { TokenMetadata } from "./pools";

export function toZRouterToken(token?: TokenMeta | TokenMetadata) {
  // check if TokenMeta or TokenMetadata
  if (!token) return undefined as any;
  if ((token as TokenMetadata)?.standard !== undefined) {
    // TokenMetadata type
    const isETH =
      (token as TokenMetadata).address === zeroAddress && token.id === 0n;

    return {
      address: (token as TokenMetadata).address,
      id: isETH
        ? 0n
        : (token as TokenMetadata).id === 0n
          ? undefined
          : (token as TokenMetadata).id,
    };
  }

  if (token.id === null) return { address: HARDCODED_ADDR.ETH } as const;

  if ((token as TokenMeta).source === "ERC20") {
    if (!(token as TokenMeta).token1)
      throw new Error(`Missing token1 for ERC20 token ${token.id}`);
    return { address: (token as TokenMeta).token1 };
  }
  if ((token as TokenMeta).source === "ZAMM")
    return { address: CoinsAddress as Address, id: token.id };
  if ((token as TokenMeta).source === "COOKBOOK")
    return { address: CookbookAddress as Address, id: token.id };

  throw new Error(`Unsupported token source: ${(token as TokenMeta).source}`);
}
