import { useState, useMemo } from "react";
import { useCoinsData } from "./metadata/use-coins-data";
import { useLaunchSalesDeadlines } from "./use-launch-sales-deadlines";
import { shouldFilterSale } from "../utils/sale-filtering";

export function usePagedLaunchSales(pageSize = 20) {
  const { data: allCoins = [], isLoading, error } = useCoinsData();
  const { data: saleDeadlines } = useLaunchSalesDeadlines();
  const [page, setPage] = useState(0);

  // Filter coins to only include active launch sales BEFORE pagination
  const filteredCoins = useMemo(() => {
    return allCoins.filter(coin => 
      !shouldFilterSale(coin, saleDeadlines || new Map())
    );
  }, [allCoins, saleDeadlines]);

  // Apply pagination to filtered data
  const total = filteredCoins.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  
  const pageItems = useMemo(() => 
    filteredCoins.slice(page * pageSize, page * pageSize + pageSize),
    [filteredCoins, page, pageSize]
  );

  const hasNextPage = page < totalPages - 1;
  const hasPrevPage = page > 0;

  const goToNextPage = () => {
    if (hasNextPage) {
      setPage(page + 1);
    }
  };

  const goToPrevPage = () => {
    if (hasPrevPage) {
      setPage(page - 1);
    }
  };

  const goToPage = (pageNumber: number) => {
    const clampedPage = Math.max(0, Math.min(pageNumber, totalPages - 1));
    setPage(clampedPage);
  };

  return {
    coins: pageItems,
    allCoins: filteredCoins, // Return filtered data as "all coins" for this context
    page,
    totalPages,
    hasNextPage,
    hasPrevPage,
    goToNextPage,
    goToPrevPage,
    setPage: goToPage,
    isLoading,
    error,
    total
  };
}