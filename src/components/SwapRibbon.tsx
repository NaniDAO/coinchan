import { truncAddress } from "@/lib/address";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { erc20Abi, PublicClient, formatUnits } from "viem";
import { mainnet } from "viem/chains";
import { usePublicClient } from "wagmi";

// Cache for token symbols to avoid repeated fetches
const tokenSymbolCache = new Map<string, string>();

// Pre-populate cache with known tokens
tokenSymbolCache.set("0x0000000000c5dc95539589fbD24BE07c6C14eCa4", "CULT");

const fetchTokenSymbol = async (tokenAddress: string, publicClient: PublicClient): Promise<string> => {
  if (tokenSymbolCache.has(tokenAddress)) {
    return tokenSymbolCache.get(tokenAddress)!;
  }

  try {
    const symbol = await publicClient.readContract({
      address: tokenAddress as `0x${string}`,
      abi: erc20Abi,
      functionName: "symbol",
    });

    tokenSymbolCache.set(tokenAddress, symbol);
    return symbol;
  } catch (error) {
    console.warn(`Failed to fetch symbol for token ${tokenAddress}:`, error);
    // Return truncated address as fallback
    const fallbackSymbol = truncAddress(tokenAddress);
    tokenSymbolCache.set(tokenAddress, fallbackSymbol);
    return fallbackSymbol;
  }
};

const fetchSwaps = async (t: (key: string) => string, publicClient: any) => {
  const res = await fetch(import.meta.env.VITE_INDEXER_URL + "/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `
      query GetSwaps {
        swaps(limit: 20, orderBy: "timestamp", orderDirection: "desc") {
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
                coin0Id
                token0
                coin1Id
                token1
              coin1 {
                symbol
                decimals
              }
              coin0 {
                symbol
                decimals
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
  const snippets = await convertToSnippets(data.swaps.items, t, publicClient);

  return snippets;
};

const convertToSnippets = async (swaps: any[], t: (key: string) => string, publicClient: any) => {
  const snippets = await Promise.all(
    swaps.map(async (swap) => {
      try {
        const { amount0In, amount0Out, amount1Out, amount1In, id, trader, pool } = swap;
        const isBuy = BigInt(amount0In) > 0n;
        const isSell = BigInt(amount0Out) > 0n;

        // Determine if this is an ERC20 token
        // ERC20: coin1Id is "0" but token1 is a non-zero address
        const isErc20 = pool.coin1Id === "0" && pool.token1 !== "0x0000000000000000000000000000000000000000";

        let tokenSymbol = pool.coin1?.symbol;
        let coinId = pool.coin1Id;

        if (isErc20) {
          // Check if this is CULT token
          if (pool.token1 === "0x0000000000c5dc95539589fbD24BE07c6C14eCa4") {
            tokenSymbol = "CULT";
          } else {
            // Fetch the actual ERC20 symbol
            tokenSymbol = await fetchTokenSymbol(pool.token1, publicClient);
          }
          // Use token1 address as the coinId for ERC20 tokens
          coinId = pool.token1;
        }

        if (isBuy) {
          return {
            id,
            snippet: (
              <span style={{ color: getColor(id) }}>
                <a target="_blank" href={"https://etherscan.io/address/" + trader} rel="noreferrer">
                  {truncAddress(trader)}
                </a>{" "}
                {t("swap.bought")} {Number(formatUnits(amount1Out, pool.coin1.decimals)).toFixed(2)}{" "}
                <Link
                  to={`/c/$coinId`}
                  params={{
                    coinId: coinId,
                  }}
                >
                  {" "}
                  {tokenSymbol}
                </Link>
              </span>
            ),
          };
        } else if (isSell) {
          return {
            id,
            snippet: (
              <span style={{ color: getColor(id) }}>
                <a target="_blank" href={"https://etherscan.io/address/" + trader} rel="noreferrer">
                  {truncAddress(trader)}
                </a>{" "}
                {t("swap.sold")} {Number(formatUnits(amount1In, pool.coin1.decimals)).toFixed(2)}{" "}
                <Link
                  to={`/c/$coinId`}
                  params={{
                    coinId: coinId,
                  }}
                >
                  {tokenSymbol}
                </Link>
              </span>
            ),
          };
        }

        return null;
      } catch (e) {
        console.warn("Skipped invalid swap", swap, e);
        return null;
      }
    }),
  );

  return snippets.filter((snippet) => snippet !== null);
};

export const useSwaps = () => {
  const { t } = useTranslation();
  const publicClient = usePublicClient({
    chainId: mainnet.id,
  });
  return useQuery({
    queryKey: ["swaps"],
    queryFn: () => fetchSwaps(t, publicClient),
    refetchInterval: 15000, // optional: auto-refetch every 15s
  });
};

const getColor = (id: string) => {
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
  const index = Number.parseInt(id.substring(2, 10), 16) % colors.length;
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

  // Add zCurve item as the first item
  const zCurveItem = {
    id: "zcurve-launch",
    snippet: (
      <Link
        to="/oneshot"
        className="text-foreground hover:underline font-medium inline-flex items-center gap-1 align-middle"
      >
        <span className="inline-block align-middle">zCurve ノ ⏝ ‿ ⌒ 〰</span>
      </Link>
    ),
  };

  const allItems = [zCurveItem, ...data];
  const repeated = [...allItems, ...allItems]; // Duplicate for seamless scroll

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
                repeat: Number.POSITIVE_INFINITY,
                repeatType: "loop",
                ease: "linear",
                duration: 33,
              }
        }
      >
        {repeated.map((item: any, index: number) => (
          <div
            key={`${item.id}-${index}`}
            className="inline-flex items-center"
            style={
              item.id === "zcurve-launch"
                ? { color: "inherit" }
                : { color: getColor(item.id) }
            }
          >
            <span className="text-sm shrink-0 inline-flex items-center">{item.snippet}</span>
            <span
              className={`text-2xl mx-3 inline-flex items-center ${item.id === "zcurve-launch" ? "text-foreground" : ""}`}
            >
              /
            </span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
