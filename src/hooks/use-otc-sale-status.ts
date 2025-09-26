import { zICOAbi, zICOAddress } from "@/constants/zICO";
import { Token } from "@/lib/pools";
import { Address } from "viem";
import { useReadContract } from "wagmi";

export interface ZICOSaleStatus {
  creator: Address;
  ethRate: bigint;
  lpBps: number;
  chefId: bigint;
  feeOrHook: bigint;
  zicoInventory: bigint;
  poolId: bigint;
  reserveEth: bigint;
  reserveCoin: bigint;
  coinsPerEthX18: bigint;
  ethPerCoinX18: bigint;
}

export const useOTCSaleStatus = ({ token }: { token?: Token }) => {
  return useReadContract({
    address: zICOAddress,
    abi: zICOAbi,
    functionName: "otcStatus",
    args: token ? [token.id] : undefined,
    query: {
      select: (data) => {
        return {
          creator: data["creator"],
          ethRate: data["ethRate"],
          lpBps: data["lpBps"],
          chefId: data["chefId"],
          feeOrHook: data["feeOrHook"],
          zicoInventory: data["zicoInventory"],
          poolId: data["poolId"],
          reserveEth: data["reserveEth"],
          reserveCoin: data["reserveCoin"],
          coinsPerEthX18: data["coinsPerEthX18"],
          ethPerCoinX18: data["ethPerCoinX18"],
        };
      },
    },
  });
};
