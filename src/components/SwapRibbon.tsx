import { truncAddress } from "@/lib/address";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const fetchSwaps = async () => {
  const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
      query GetSwaps {
        swaps(limit: 5, orderBy: "timestamp", orderDirection: "desc") {
          items {
            amount0In
            amount0Out
            amount1In
            amount1Out
            blockNumber
            id
            poolId
            source
            swapFee
            timestamp
            toAddr
            trader
            txHash
            pool {
              coin1 {
                symbol
              }
            }
          }
        }
      }
      `,
    }),
  });

  const { data } = await res.json();

  // convert swaps to human readable snippets
  return convertToSnippets(data.swaps.items);
};

const convertToSnippets = (swaps: any[]) => {
  return swaps.map((swap) => {
    const { amount0In, amount0Out, amount1Out, id, trader, pool } = swap;
    const isBuy = BigInt(amount0In) > 0n;
    const isSell = BigInt(amount0Out) > 0n;

    if (isBuy) {
      return {
        id,
        snippet: `${truncAddress(trader)} bought ${Number(formatEther(amount1Out)).toFixed(2)} ${pool.coin1.symbol}`,
      };
    } else if (isSell) {
      return {
        id,
        snippet: `${truncAddress(trader)} sold ${Number(formatEther(amount0Out)).toFixed(2)} ${pool.coin1.symbol}`,
      };
    }
  });
};

export const useSwaps = () => {
  return useQuery({
    queryKey: ["swaps"],
    queryFn: fetchSwaps,
    refetchInterval: 15000, // optional: auto-refetch every 15s
  });
};

export const getColor = (id: string) => {
  const colors = [
    "#F2659A", // Pink
    "#34E4FF", // Cyan Blue
    "#F7E872", // Light Yellow
    "#81D89A", // Light Green
    "#FFA73D", // Orange
    "#BB7BF3", // Purple
    "#ffffff", // White
  ];
  const index = parseInt(id.substring(2, 10), 16) % colors.length;
  return colors[index];
};

export function SwapRibbon() {
  const { data, isLoading, error } = useSwaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);

  useEffect(() => {
    if (containerRef.current) {
      setContentWidth(containerRef.current.scrollWidth);
    }
  }, [data]);

  if (isLoading || error || !data) return null;

  const repeated = [...data, ...data]; // Duplicate for seamless scroll

  return (
    <div className="fixed top-0 left-0 w-full bg-black text-white overflow-hidden z-50 border-b-2 border-double border-white h-10 flex items-center">
      <motion.div
        className="flex whitespace-nowrap gap-2 px-4"
        ref={containerRef}
        animate={{ x: [`0`, `-${contentWidth / 2}px`] }}
        transition={{
          repeat: Infinity,
          repeatType: "loop",
          ease: "linear",
          duration: 20, // Adjust speed here
        }}
      >
        {repeated.map((item: any, index: number) => (
          <div key={`${item.id}-${index}`} style={{ color: getColor(item.id) }}>
            <span className="text-sm shrink-0">{item.snippet}</span>
            <span className="text-2xl mx-2">/</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
