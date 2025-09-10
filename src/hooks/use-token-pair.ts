import type { TokenMetadata } from "@/lib/pools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StoredShape = {
  v: 1; // storage version
  at: number; // last updated (ms)
  sellToken?: TokenMetadata | null;
  buyToken?: TokenMetadata | null;
};

export type UseTokenPairOptions = {
  /** localStorage key (use a different one for limit orders, etc.) */
  key?: string;
  /** Initial values used when nothing in storage or expired/invalid */
  initial?: { sellToken?: TokenMetadata; buyToken?: TokenMetadata | null };
  /** Disable persistence entirely */
  persist?: boolean;
  /** Expire stored values after this many ms (optional) */
  ttlMs?: number;
  /** Optional validation step for tokens before accepting from storage */
  validateToken?: (
    t: TokenMetadata | null | undefined,
  ) => t is TokenMetadata | null | undefined;
  /** Called whenever either token changes */
  onChange?: (state: {
    sellToken?: TokenMetadata;
    buyToken?: TokenMetadata | null;
  }) => void;
};

const VERSION = 1;
const DEFAULT_KEY = "swap.pair";

function safeParse(json: string | null): StoredShape | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as StoredShape;
    if (!obj || typeof obj !== "object") return null;
    if (obj.v !== VERSION || typeof obj.at !== "number") return null;
    return obj;
  } catch {
    return null;
  }
}

function now() {
  return Date.now();
}

export function useTokenPair(opts: UseTokenPairOptions = {}) {
  const {
    key = DEFAULT_KEY,
    initial,
    persist = true,
    ttlMs,
    validateToken,
    onChange,
  } = opts;

  // lazy init from storage
  const initialRef = useRef(initial); // keep original initial stable
  const [sellToken, setSellToken] = useState<TokenMetadata | undefined>(() => {
    if (typeof window === "undefined" || !persist) return initial?.sellToken;
    const parsed = safeParse(window.localStorage.getItem(key));
    if (!parsed) return initial?.sellToken;
    if (ttlMs && now() - parsed.at > ttlMs) return initial?.sellToken;

    const s = parsed.sellToken ?? undefined;
    return validateToken
      ? validateToken(s)
        ? (s as TokenMetadata | undefined)
        : initial?.sellToken
      : (s as TokenMetadata | undefined);
  });

  const [buyToken, setBuyToken] = useState<TokenMetadata | null | undefined>(
    () => {
      if (typeof window === "undefined" || !persist)
        return initial?.buyToken ?? null;
      const parsed = safeParse(window.localStorage.getItem(key));
      if (!parsed) return initial?.buyToken ?? null;
      if (ttlMs && now() - parsed.at > ttlMs) return initial?.buyToken ?? null;

      const b = parsed.buyToken ?? null;
      return validateToken
        ? validateToken(b)
          ? (b as TokenMetadata | null | undefined)
          : (initial?.buyToken ?? null)
        : (b as TokenMetadata | null | undefined);
    },
  );

  const lastUpdated = useRef<number>(now());

  // Write to storage (debounced lightly)
  useEffect(() => {
    if (!persist || typeof window === "undefined") return;

    const id = window.setTimeout(() => {
      const payload: StoredShape = {
        v: VERSION,
        at: now(),
        sellToken: sellToken ?? null,
        buyToken: (buyToken ?? null) as TokenMetadata | null,
      };
      lastUpdated.current = payload.at;
      try {
        window.localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 0); // micro-debounce; bump to 100–200ms if you prefer

    return () => window.clearTimeout(id);
  }, [sellToken, buyToken, persist, key]);

  // Cross-tab sync
  useEffect(() => {
    if (!persist || typeof window === "undefined") return;

    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      const parsed = safeParse(e.newValue);
      if (!parsed) return;
      if (ttlMs && now() - parsed.at > ttlMs) return;

      // Avoid feedback loop if this tab wrote it
      if (parsed.at <= lastUpdated.current) return;

      const s = parsed.sellToken ?? undefined;
      const b = parsed.buyToken ?? null;

      // Optional validation
      if (validateToken && !validateToken(s)) return;
      if (validateToken && !validateToken(b)) return;

      setSellToken(s as TokenMetadata | undefined);
      setBuyToken(b as TokenMetadata | null | undefined);
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [persist, key, ttlMs, validateToken]);

  // Notify external listeners
  useEffect(() => {
    if (!onChange) return;
    onChange({
      sellToken,
      buyToken: (buyToken ?? null) as TokenMetadata | null,
    });
  }, [sellToken, buyToken, onChange]);

  const flip = useCallback(() => {
    if (!buyToken) return;
    setSellToken(buyToken as TokenMetadata);
    setBuyToken(sellToken ?? null);
  }, [sellToken, buyToken]);

  const reset = useCallback(() => {
    setSellToken(initialRef.current?.sellToken);
    setBuyToken(initialRef.current?.buyToken ?? undefined);
  }, []);

  const state = useMemo(
    () => ({
      sellToken,
      buyToken: buyToken as TokenMetadata,
    }),
    [sellToken, buyToken],
  );

  return {
    ...state,
    setSellToken,
    setBuyToken,
    flip,
    reset,
    key,
  };
}
