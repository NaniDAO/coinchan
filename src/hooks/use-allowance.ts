import { Address, erc20Abi } from "viem";
import { mainnet } from "viem/chains";
import { useReadContract } from "wagmi";

interface UseAllowanceProps {
  token: Address;
  user: Address;
  allows: Address;
  enabled: boolean;
}

export const useAllowance = ({
  token,
  user,
  allows,
  enabled = true,
}: UseAllowanceProps) => {
  return useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [user, allows],
    chainId: mainnet.id,
    query: {
      enabled,
    },
  });
};
