import { useCallback, useEffect, useMemo, useState } from "react";
import type { CoinData } from "./coin-utils";
import { useCoinsData } from "./use-coins-data";

export function usePagedCoins(pageSize = 20) {
  const { data = [], isLoading, error } = useCoinsData();
  const [page, setPage] = useState(0);

  // @ts-ignore
  const total = data?.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    // Only adjust the page if it's out of range (too high)
    // This prevents issues with previous page navigation
    if (page >= totalPages && totalPages > 0) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

  const pageItems = useMemo<CoinData[]>(
    // @ts-ignore
    () => data?.slice(page * pageSize, page * pageSize + pageSize),
    [data, page, pageSize],
  );

  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;
  const next = useCallback(() => hasNext && setPage((p) => p + 1), [hasNext]);
  const prev = useCallback(() => hasPrev && setPage((p) => p - 1), [hasPrev]);

  return {
    coins: pageItems,
    allCoins: data,
    total,
    page,
    totalPages,
    isLoading,
    error,
    hasNext,
    hasPrev,
    goToNextPage: next,
    goToPreviousPage: prev,
    setPage,
  };
}
