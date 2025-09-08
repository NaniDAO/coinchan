import { getAddress, isAddress } from "viem";
import type { Address } from "viem";
import type { Token, TokenMetadata } from "@/lib/pools";

/** Canonical encoder: "0xabc...:123" */
export const encodeTokenQ = (t?: Token | TokenMetadata | null) => (t ? `${t.address}:${t.id.toString()}` : undefined);

type Parsed =
  | { kind: "addrid"; address: Address; id: bigint }
  | { kind: "addr"; address: Address }
  | { kind: "id"; id: bigint }
  | { kind: "symbol"; symbol: string };

/** Accepts: "0x...:id" | "0x..." | "SYMBOL" | "123" */
export const parseTokenQ = (s?: string): Parsed | null => {
  if (!s) return null;
  const raw = s.trim();

  // Address:ID
  const colon = raw.indexOf(":");
  if (colon > 0) {
    const a = raw.slice(0, colon);
    const idStr = raw.slice(colon + 1);
    if (isAddress(a)) {
      try {
        return {
          kind: "addrid",
          address: getAddress(a as Address),
          id: BigInt(idStr),
        };
      } catch {
        /* fall through */
      }
    }
  }

  // Address only
  if (isAddress(raw)) {
    return { kind: "addr", address: getAddress(raw as Address) };
  }

  // Pure numeric → id only
  if (/^\d+$/.test(raw)) {
    try {
      return { kind: "id", id: BigInt(raw) };
    } catch {
      /* fall through */
    }
  }

  // Symbol fallback
  const sym = raw.toUpperCase();
  if (/^[A-Za-z0-9.$-]{2,10}$/.test(raw)) {
    return { kind: "symbol", symbol: sym };
  }

  return null;
};

/** Strict finder (address+id) */
export const findTokenExact = (
  list: TokenMetadata[] | undefined,
  ref: { address: Address; id: bigint } | null,
): TokenMetadata | undefined =>
  !list || !ref
    ? undefined
    : list.find((t) => t.id === ref.id && String(t.address).toLowerCase() === String(ref.address).toLowerCase());

/** Flexible finder with sensible preferences:
 *  1) address+id exact
 *  2) address only → prefer id=0, else first
 *  3) id only → first match
 *  4) symbol only → prefer id=0, else first (case-insensitive)
 */
export const findTokenFlexible = (
  list: TokenMetadata[] | undefined,
  q: string | undefined,
): TokenMetadata | undefined => {
  if (!list?.length) return undefined;
  const parsed = parseTokenQ(q);
  if (!parsed) return undefined;

  switch (parsed.kind) {
    case "addrid":
      return findTokenExact(list, parsed);

    case "addr": {
      const matches = list.filter((t) => String(t.address).toLowerCase() === String(parsed.address).toLowerCase());
      if (!matches.length) return undefined;
      const id0 = matches.find((t) => t.id === 0n);
      return id0 ?? matches[0];
    }

    case "id": {
      const matches = list.filter((t) => t.id === parsed.id);
      return matches[0];
    }

    case "symbol": {
      const matches = list.filter((t) => (t.symbol ?? "").toUpperCase() === parsed.symbol);
      if (!matches.length) return undefined;
      const id0 = matches.find((t) => t.id === 0n);
      return id0 ?? matches[0];
    }
  }
};

/** True if query is already in canonical "address:id" form */
export const isCanonicalTokenQ = (s?: string): boolean => {
  const p = parseTokenQ(s);
  return p?.kind === "addrid";
};
