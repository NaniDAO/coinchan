import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import type { CoinSource } from "@/lib/coins";
import { useReadContract } from "wagmi";
import { ZAMMAbi, ZAMMAddress } from "../constants/ZAAM";

export function useReserves({
  poolId,
  source = "ZAMM",
}: {
  poolId: bigint | undefined;
  source?: CoinSource;
}) {
  return useReadContract({
    address: source === "ZAMM" ? ZAMMAddress : CookbookAddress,
    abi: source === "ZAMM" ? ZAMMAbi : CookbookAbi,
    functionName: "pools",
    args: poolId ? [poolId] : undefined,
    query: {
      enabled: poolId !== undefined,
      select: (data) => {
        return {
          reserve0: data[0],
          reserve1: data[1],
          blockTimestampLast: data[2],
          price0CumulativeLast: data[3],
          price1CumulativeLast: data[4],
          kLast: data[5],
          supply: data[6], // Total LP token supply
        };
      },
    },
  });
}
