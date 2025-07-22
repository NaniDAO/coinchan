import { CoinSource } from "@/lib/coins";

export const BuySellPool = ({
  poolId,
  source,
}: {
  poolId: bigint;
  source: CoinSource;
}) => {
  console.log(poolId, source);
  return null;
};
