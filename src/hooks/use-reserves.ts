import { useReadContract } from "wagmi";
import { ZAMMAbi, ZAMMAddress } from "../constants/ZAAM";

export function useReserves({ poolId }: { poolId: bigint | undefined }) {
  return useReadContract({
    address: ZAMMAddress,
    abi: ZAMMAbi,
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
