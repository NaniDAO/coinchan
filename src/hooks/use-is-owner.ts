import { useQuery } from "@tanstack/react-query";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient } from "wagmi";
import { CoinchanAbi, CoinchanAddress } from "../constants/Coinchan";

type UseIsOwnerArgs = {
  tokenId?: bigint; // the coin id (can be undefined while loading)
  refetchKey?: unknown; // an optional key that forces a refetch (e.g. txHash)
};

export const useIsOwner = ({ tokenId, refetchKey }: UseIsOwnerArgs) => {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  return useQuery({
    queryKey: ["isOwner", tokenId?.toString(), address, refetchKey],
    enabled: Boolean(tokenId && address && publicClient),
    staleTime: 30_000, // tweak to taste
    refetchOnWindowFocus: false,

    queryFn: async () => {
      const lockup = (await publicClient!.readContract({
        address: CoinchanAddress,
        abi: CoinchanAbi,
        functionName: "lockups",
        args: [tokenId as bigint],
      })) as readonly [string, number, number, boolean, bigint, bigint];

      const [lockupOwner] = lockup;
      return !!lockupOwner && !!address && lockupOwner.toLowerCase() === address.toLowerCase();
    },
  });
};
