import { useReadContract } from "wagmi";
import { ZAAMAbi, ZAAMAddress } from "../constants/ZAAM";

export function useReserves({ poolId }: { poolId: bigint | undefined }) {
  return useReadContract({
    address: ZAAMAddress,
    abi: ZAAMAbi,
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
