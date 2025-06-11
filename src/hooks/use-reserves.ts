import { useReadContract } from "wagmi";
import { ZAMMAbi, ZAMMAddress } from "../constants/ZAAM";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";

export function useReserves({
  poolId,
  source = "ZAMM",
}: {
  poolId: bigint | undefined;
  source?: "COOKBOOK" | "ZAMM";
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
        };
      },
    },
  });
}
