import { CoinsAddress } from "@/constants/Coins";
import { CookbookAddress } from "@/constants/Cookbook";
import { Address } from "viem";
import { HARDCODED_ADDR, TokenMeta } from "./coins";

export function toZRouterToken(token?: TokenMeta) {
  if (!token) return undefined as any;
  if (token.id === null) return { address: HARDCODED_ADDR.ETH } as const;

  if (token.source === "ERC20") {
    if (!token.token1) throw new Error(`Missing token1 for ERC20 token ${token.id}`);
    return { address: token.token1 };
  }
  if (token.source === "ZAMM") return { address: CoinsAddress as Address, id: token.id };
  if (token.source === "COOKBOOK") return { address: CookbookAddress as Address, id: token.id };

  throw new Error(`Unsupported token source: ${token.source}`);
}
