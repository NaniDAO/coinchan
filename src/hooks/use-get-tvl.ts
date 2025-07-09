import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CoinSource } from "@/lib/coins";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";

export const useGetTVL = ({
  poolId,
  source,
}: {
  poolId: bigint | undefined;
  source: CoinSource;
}) => {
  return useReadContract({
    address: source === "ZAMM" ? ZAMMAddress : CookbookAddress,
    abi: source === "ZAMM" ? ZAMMAbi : CookbookAbi,
    functionName: "pools",
    args: poolId ? [poolId] : undefined,
    query: {
      select: (data) => {
        return Number(formatEther(data[0] * 2n));
      },
    },
  });
};
