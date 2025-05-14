import React, { useRef, useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { formatEther } from "viem";

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
      throw new Error("Network response was not ok");
    }
    return res.json();
  };

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    status,
  } = useInfiniteQuery({
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
    return (
      <p className="text-center p-4 text-red-600">Error: {error.message}</p>
    );
  }

  // Flatten pages
  const events = data.pages.flatMap((page) => page.data);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white shadow rounded-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-semibold">
              Timestamp
            </th>
            <th className="px-4 py-2 text-left text-sm font-semibold">Type</th>
            <th className="px-4 py-2 text-right text-sm font-semibold">ETH</th>
            <th className="px-4 py-2 text-right text-sm font-semibold">
              {ticker.toUpperCase()}
            </th>
            <th className="px-4 py-2 text-right text-sm font-semibold">
              Maker
            </th>
            <th className="px-4 py-2 text-left text-sm font-semibold">Txn</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {events.map((e, idx) => (
            <tr
              key={`${e.txhash}-${e.timestamp}-${idx}`}
              className="hover:bg-gray-50"
            >
              <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">
                {new Date(e.timestamp * 1000).toLocaleString()}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-blue-600">
                {e.type}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                {e.type === "BUY"
                  ? Number(formatEther(BigInt(e?.amount0_in ?? "0"))).toFixed(2)
                  : Number(formatEther(BigInt(e?.amount1_in ?? "0"))).toFixed(
                      2,
                    )}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                {e.type === "BUY"
                  ? Number(formatEther(BigInt(e?.amount1_out ?? "0"))).toFixed(
                      2,
                    )
                  : Number(formatEther(BigInt(e?.amount0_out ?? "0"))).toFixed(
                      2,
                    )}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-right">
                {e.maker ?? "-"}
              </td>
              <td className="px-4 py-2 whitespace-nowrap text-sm text-indigo-600">
                <a
                  href={`${import.meta.env.VITE_INDEXER_URL}/graphql/tx/${e.txhash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {e.txhash.slice(0, 6)}...{e.txhash.slice(-4)}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div ref={loadMoreRef} className="py-4 text-center text-sm text-gray-500">
        {isFetchingNextPage
          ? "Loading more..."
          : hasNextPage
            ? "Scroll to load more"
            : "No more events"}
      </div>
    </div>
  );
}
