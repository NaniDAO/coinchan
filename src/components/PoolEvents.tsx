import { useInfiniteQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRef, useEffect } from "react";
import { formatTimeAgo } from "@/lib/date";
import { getEtherscanAddressUrl, getEtherscanTxUrl } from "@/lib/explorer";
import { AddressIcon } from "./AddressIcon";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * Helper function to get the appropriate color class for event type
 * @param {string} eventType - The type of event
 * @returns {string} - The CSS class for coloring
 */
const getEventTypeColorClass = (eventType: string): string => {
  switch (eventType) {
    case "BUY":
      return "text-green-600 dark:text-green-500 font-semibold";
    case "SELL":
      return "text-destructive font-medium";
    case "LIQADD":
      return "text-green-700 dark:text-green-600 font-semibold";
    case "LIQREM":
      return "text-red-700 dark:text-red-500 font-medium";
    default:
      return "text-primary";
  }
};

/**
 * PoolEvents component
 * @param {{ poolId: string | number }} props
 * @returns JSX.Element
 */
export function PoolEvents({
  poolId,
  ticker,
}: {
  poolId: string;
  ticker: string;
}) {
  const { t } = useTranslation();
  // Fetch function for react-query infinite query
  const fetchEvents = async ({ pageParam = Math.floor(Date.now() / 1000) }) => {
    const url = `${import.meta.env.VITE_INDEXER_URL}/api/events?poolId=${poolId}&before=${pageParam}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Network response was not ok");
    }
    return res.json();
  };

  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useInfiniteQuery({
    queryKey: ["events", poolId],
    queryFn: fetchEvents,
    initialPageParam: Math.floor(Date.now() / 1000),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  // Sentinel ref for infinite scroll
  const loadMoreRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 1.0 },
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }
    return () => {
      observer.disconnect();
    };
  }, [fetchNextPage, hasNextPage]);

  if (status === "pending") {
    return <p className="text-center p-4">{t("chart.loading_events")}</p>;
  }

  if (status === "error") {
    return (
      <p className="text-center p-4 text-destructive">
        {t("errors.error")}: {error.message}
      </p>
    );
  }

  // Flatten pages
  const events = data.pages.flatMap((page) => page.data);

  return (
    <div className="w-full">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("chart.timestamp")}</TableHead>
              <TableHead>{t("chart.type")}</TableHead>
              <TableHead className="text-right">ETH</TableHead>
              <TableHead className="text-right">{ticker.toUpperCase()}</TableHead>
              <TableHead className="text-right">{t("chart.maker")}</TableHead>
              <TableHead>{t("chart.transaction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length > 0 ? (
              events.map((e, idx) => (
                <TableRow key={`${e.txhash}-${e.timestamp}-${idx}`}>
                  <TableCell className="whitespace-nowrap">{formatTimeAgo(e?.timestamp ?? 0)}</TableCell>
                  <TableCell className={getEventTypeColorClass(e.type)}>{t(`chart.event_types.${e.type}`)}</TableCell>
                  <TableCell className={cn("text-right", getEventTypeColorClass(e.type))}>
                    {e.type === "BUY" && Number(formatEther(BigInt(e?.amount0_in ?? "0"))).toFixed(5)}
                    {e.type === "SELL" && Number(formatEther(BigInt(e?.amount0_out ?? "0"))).toFixed(5)}
                    {e.type === "LIQADD" && Number(formatEther(BigInt(e?.amount0_in ?? "0"))).toFixed(5)}
                    {e.type === "LIQREM" && Number(formatEther(BigInt(e?.amount0_out ?? "0"))).toFixed(5)}
                  </TableCell>
                  <TableCell className={cn("text-right", getEventTypeColorClass(e.type))}>
                    {e.type === "BUY" && Number(formatEther(BigInt(e?.amount1_out ?? "0"))).toFixed(5)}
                    {e.type === "SELL" && Number(formatEther(BigInt(e?.amount1_in ?? "0"))).toFixed(5)}
                    {e.type === "LIQADD" && Number(formatEther(BigInt(e?.amount1_in ?? "0"))).toFixed(5)}
                    {e.type === "LIQREM" && Number(formatEther(BigInt(e?.amount1_out ?? "0"))).toFixed(5)}
                  </TableCell>
                  <TableCell className={cn("text-right", getEventTypeColorClass(e.type))}>
                    {e.maker ? (
                      <div className="flex flex-row space-x-1">
                        <AddressIcon address={e.maker} className="h-5 w-5 rounded-lg" />
                        <a
                          href={getEtherscanAddressUrl(e.maker)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          {e.maker.slice(-4)}
                        </a>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className={cn(getEventTypeColorClass(e.type))}>
                    <a
                      href={getEtherscanTxUrl(e.txhash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline"
                    >
                      {e.txhash.slice(0, 6)}...{e.txhash.slice(-4)}
                    </a>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  {t("chart.no_events")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div ref={loadMoreRef} className="py-4 text-center text-sm text-gray-500">
        {isFetchingNextPage
          ? t("chart.loading_more")
          : hasNextPage
            ? t("chart.scroll_to_load_more")
            : t("chart.no_more_events")}
      </div>
    </div>
  );
}
