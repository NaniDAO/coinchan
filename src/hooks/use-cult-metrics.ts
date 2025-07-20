import { useQuery } from "@tanstack/react-query";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { usePublicClient } from "wagmi";
import { mainnet } from "viem/chains";
import { CultHookAbi, CultHookAddress } from "@/constants/CultHook";
import { CULT_ADDRESS } from "@/lib/coins";
import { erc20Abi } from "viem";
import { getAmountOut } from "@/lib/swap";

type ReservesData = {
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: number;
  price0CumulativeLast: bigint;
  price1CumulativeLast: bigint;
  kLast: bigint;
  supply: bigint;
} | null;

interface CultPriceData {
  cultPrice: string;
  cultUsdPrice: string;
}

interface CultMetrics {
  totalSupply: bigint;
  accumulatedTax: string;
  floorProgress: number;
}

// Separate hook for price updates (9s interval for shake animation)
export function useCultPrice(reserves: ReservesData | null, ethUsdPrice: number) {
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["cultPrice", reserves?.reserve0?.toString(), reserves?.reserve1?.toString(), ethUsdPrice],
    queryFn: async () => {
      if (!reserves || !reserves.reserve0 || !reserves.reserve1) {
        return { cultPrice: "--.--.--", cultUsdPrice: "--" };
      }

      // Calculate CULT price
      const oneEth = parseEther("1");
      const cultOut = getAmountOut(oneEth, reserves.reserve0, reserves.reserve1, 30n);
      const price = formatUnits(cultOut, 18);
      const cultPrice = parseFloat(price).toFixed(2);

      // Calculate USD price
      let cultUsdPrice = "--";
      if (ethUsdPrice > 0) {
        const cultPriceInEth = 1 / parseFloat(price);
        const cultPriceInUsd = cultPriceInEth * ethUsdPrice;

        if (cultPriceInUsd < 0.000001) {
          cultUsdPrice = cultPriceInUsd.toExponential(2);
        } else if (cultPriceInUsd < 0.01) {
          cultUsdPrice = cultPriceInUsd.toFixed(6);
        } else {
          cultUsdPrice = cultPriceInUsd.toFixed(4);
        }
      }

      return { cultPrice, cultUsdPrice };
    },
    refetchInterval: 9000, // Keep your 9 second shake!
    staleTime: 8000,
    enabled: !!reserves && !!reserves.reserve0 && !!reserves.reserve1,
  });
}

// Other metrics with 15s interval
export function useCultMetrics(reserves: ReservesData | null, ethUsdPrice: number) {
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["cultMetrics", reserves?.reserve0?.toString(), reserves?.reserve1?.toString(), ethUsdPrice],
    queryFn: async (): Promise<CultMetrics> => {
      if (!publicClient || !reserves || !reserves.reserve0 || !reserves.reserve1) {
        throw new Error("Missing required data");
      }

      // Fetch all data in parallel
      const [totalSupplyResult, taxAccumulatorResult] = await Promise.all([
        publicClient.readContract({
          address: CULT_ADDRESS,
          abi: erc20Abi,
          functionName: "totalSupply",
        }),
        publicClient.readContract({
          address: CultHookAddress,
          abi: CultHookAbi,
          functionName: "receiver",
        }).then(async (receiverAddress) => {
          // Get ETH balance of the receiver (tax accumulator)
          return publicClient.getBalance({
            address: receiverAddress as `0x${string}`,
          });
        }),
      ]);

      const totalSupply = totalSupplyResult as bigint;
      const taxAccumulator = taxAccumulatorResult as bigint;

      // Calculate accumulated tax and floor progress
      const ethAmount = formatEther(taxAccumulator);
      const progress = (parseFloat(ethAmount) / 2.488) * 100;

      return {
        totalSupply,
        accumulatedTax: ethAmount,
        floorProgress: Math.min(progress, 100),
      };
    },
    refetchInterval: 15000, // Refetch every 15 seconds (balanced between 9s and 30s)
    staleTime: 10000,
    enabled: !!publicClient && !!reserves && !!reserves.reserve0 && !!reserves.reserve1,
  });
}

// Hook for swap amount calculations
export function useCultSwapEstimate(
  amount: string,
  tab: "buy" | "sell",
  reserves: ReservesData | null
) {
  return useQuery({
    queryKey: ["cultSwapEstimate", amount, tab, reserves?.reserve0?.toString(), reserves?.reserve1?.toString()],
    queryFn: () => {
      if (!reserves || !reserves.reserve0 || !reserves.reserve1 || !amount) {
        return "0";
      }

      try {
        if (tab === "buy") {
          const inWei = parseEther(amount);
          const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, 30n);
          return formatUnits(rawOut, 18);
        } else {
          const inUnits = parseUnits(amount, 18);
          const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, 30n);
          return formatEther(rawOut);
        }
      } catch {
        return "0";
      }
    },
    staleTime: 1000, // Keep estimates fresh
    enabled: !!reserves && !!amount && parseFloat(amount) > 0,
  });
}