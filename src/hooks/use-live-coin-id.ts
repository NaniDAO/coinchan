import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { zeroAddress } from "viem";

export function useLiveCoinId() {
  const publicClient = usePublicClient();

  return useQuery({
    queryKey: ["live-coinId"],
    queryFn: async () => {
      if (!publicClient) return null;

      const sim = await publicClient.simulateContract({
        abi: CookbookAbi,
        address: CookbookAddress,
        functionName: "coin",
        args: [zeroAddress, 10n, ""],
      });
      const predictedCoinId = sim.result as unknown as bigint; // depends on your ABI return

      return predictedCoinId as bigint;
    },
    enabled: !!publicClient,
    refetchInterval: 5000, // poll every 5s to stay "live"
  });
}
