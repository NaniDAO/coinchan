import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTimeAgo } from "@/lib/date";
import { getEtherscanAddressUrl, getEtherscanTxUrl } from "@/lib/explorer";
import { cn } from "@/lib/utils";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { formatEther } from "viem";
import { AddressIcon } from "./AddressIcon";

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
  // Fetch function for react-query infinite query
  const fetchEvents = async ({ pageParam = Math.floor(Date.now() / 1000) }) => {
    const url = `${import.meta.env.VITE_INDEXER_URL}/api/events?poolId=${poolId}&before=${pageParam}&limit=50`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error("Failed to fetch events:", res.status, res.statusText);
      throw new Error("Network response was not ok");
    }
    const data = await res.json();
    return data;
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
    return <p className="text-center p-4">Loading events...</p>;
  }

  if (status === "error") {
    return <p className="text-center p-4 text-destructive">Error: {error.message}</p>;
  }

  // Flatten pages
  const events = data.pages.flatMap((page) => page.data);

  return (
    <div className="w-full">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">ETH</TableHead>
              <TableHead className="text-right">{ticker.toUpperCase()}</TableHead>
              <TableHead className="text-right">Maker</TableHead>
              <TableHead>Txn</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length > 0 ? (
              events.map((e, idx) => (
                <TableRow key={`${e.txhash}-${e.timestamp}-${idx}`}>
                  <TableCell className="whitespace-nowrap">{formatTimeAgo(e?.timestamp ?? 0)}</TableCell>
                  <TableCell className={getEventTypeColorClass(e.type)}>{e.type}</TableCell>
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
                  No events found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div ref={loadMoreRef} className="py-4 text-center text-sm text-gray-500">
        {isFetchingNextPage ? "Loading more..." : hasNextPage ? "Scroll to load more" : "No more events"}
      </div>
    </div>
  );
}
