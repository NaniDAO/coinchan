import { fetchPools } from "@/components/CoinPoolsList";
import { Token } from "@/lib/pools";
import { useQuery } from "@tanstack/react-query";
import { formatEther, zeroAddress } from "viem";

export const useCoinPrice = ({ token }: { token?: Token }) => {
  return useQuery({
    queryKey: ["coin-price", token?.id?.toString(), token?.address?.toString()],
    queryFn: async () => {
      if (!token) return 0;

      if (!token) return 0;
      const pools = (await fetchPools(token.id.toString(), token.address)).filter(
        (pool) => pool.token0 === zeroAddress,
      );

      const reserve0 = BigInt(pools[0]?.reserve0 ?? 0);
      const reserve1 = BigInt(pools[0]?.reserve1 ?? 0);
      const SCALING1 = 10n ** BigInt(18);

      const price1Fixed = reserve1 === 0n ? 0n : (reserve0 * SCALING1) / reserve1;

      return Number(formatEther(price1Fixed));
    },
    enabled: !!token,
  });
};
