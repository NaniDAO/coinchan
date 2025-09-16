import type { TokenMetadata } from "@/lib/pools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type UseTokenPairOptions = {
  /** Initial values */
  initial?: { sellToken?: TokenMetadata; buyToken?: TokenMetadata | null };
  /** Called whenever either token changes */
  onChange?: (state: {
    sellToken?: TokenMetadata;
    buyToken?: TokenMetadata | null;
  }) => void;
};

export function useTokenPair(opts: UseTokenPairOptions = {}) {
  const { initial, onChange } = opts;

  // keep original initial stable
  const initialRef = useRef(initial);

  const [sellToken, setSellToken] = useState<TokenMetadata | undefined>(initial?.sellToken);

  const [buyToken, setBuyToken] = useState<TokenMetadata | null | undefined>(initial?.buyToken ?? null);

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
  };
}
