import { truncAddress } from "@/lib/address";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

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
                id
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
    const { amount0In, amount0Out, amount1Out, amount1In, id, trader, pool } =
      swap;
    const isBuy = BigInt(amount0In) > 0n;
    const isSell = BigInt(amount0Out) > 0n;

    if (isBuy) {
      return {
        id,
        snippet: (
          <>
            <a target="_blank" href={"https://etherscan.io/address/" + trader}>
              {truncAddress(trader)}
            </a>{" "}
            bought {Number(formatEther(amount1Out)).toFixed(2)}{" "}
            <Link
              to={`/c/$coinId`}
              params={{
                coinId: pool.coin1.id,
              }}
            >
              {pool.coin1.symbol}
            </Link>
          </>
        ),
      };
    } else if (isSell) {
      return {
        id,
        snippet: (
          <span style={{ color: getColor(id) }}>
            <a target="_blank" href={"https://etherscan.io/address/" + trader}>
              {truncAddress(trader)}
            </a>{" "}
            sold {Number(formatEther(amount1In)).toFixed(2)}{" "}
            <Link
              to={`/c/$coinId`}
              params={{
                coinId: pool.coin1.id,
              }}
            >
              {pool.coin1.symbol}
            </Link>
          </span>
        ),
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
    "#FF99CC", // Light Pink
    "#66FFCC", // Mint Green
    "#FFB366", // Peach
  ];
  const index = parseInt(id.substring(2, 10), 16) % colors.length;
  return colors[index];
};

export function SwapRibbon() {
  const { data, isLoading, error } = useSwaps();
  const containerRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      setContentWidth(containerRef.current.scrollWidth);
    }
  }, [data]);

  if (isLoading || error || !data) return null;

  const repeated = [...data, ...data]; // Duplicate for seamless scroll

  return (
    <div
      className="fixed top-0 left-0 w-full bg-background overflow-hidden z-50 border-b-2 border-double border-border h-10 flex items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <motion.div
        className="flex justify-center items-center whitespace-nowrap gap-2 px-4"
        ref={containerRef}
        animate={paused ? { x: 0 } : { x: [`0`, `-${contentWidth / 2}px`] }}
        transition={
          paused
            ? { duration: 0 }
            : {
                repeat: Infinity,
                repeatType: "loop",
                ease: "linear",
                duration: 20,
              }
        }
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
