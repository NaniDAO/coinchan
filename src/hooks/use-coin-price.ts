import { CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CoinSource } from "@/lib/coins";
import { computePoolId, SWAP_FEE } from "@/lib/swap";
import { useMemo } from "react";
import { Address, formatEther, isAddressEqual } from "viem";
import { useReadContract } from "wagmi";

const getCoinSource = (coinId: bigint | undefined, coinContract: Address | undefined): CoinSource | undefined => {
  if (!coinId || !coinContract) return undefined;
  if (isAddressEqual(coinContract, CoinsAddress)) {
    return "ZAMM";
  }
  if (isAddressEqual(coinContract, CookbookAddress)) {
    return "COOKBOOK";
  }

  return undefined;
};

export const useCoinPrice = ({
  coinId,
  coinContract,
  contractSource,
}: {
  coinId: bigint | undefined;
  coinContract: Address | undefined;
  contractSource: CoinSource | undefined;
}) => {
  const [source, poolId] = useMemo(() => {
    if (!coinId) return [undefined, undefined];
    const source = contractSource ?? (coinContract ? getCoinSource(coinId, coinContract) : undefined);
    if (!source) return [undefined, undefined];
    const poolId = computePoolId(coinId, SWAP_FEE, source === "ZAMM" ? CoinsAddress : CookbookAddress);
    return [source, poolId];
  }, [coinContract]);

  return useReadContract({
    address: source === "ZAMM" ? ZAMMAddress : CookbookAddress,
    abi: source === "ZAMM" ? ZAMMAbi : CookbookAbi,
    functionName: "pools",
    args: poolId ? [poolId] : undefined,
    query: {
      select: (data) => {
        const reserve0 = data?.[0];
        const reserve1 = data?.[1];
        const SCALING1 = 10n ** BigInt(18);

        const price1Fixed = reserve1 === 0n ? 0n : (reserve0 * SCALING1) / reserve1;

        return Number(formatEther(price1Fixed));
      },
    },
  });
};
