import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CoinSource } from "@/lib/coins";
import { Address } from "viem";
import { useReadContract } from "wagmi";

export const useLpOperatorStatus = ({
  owner,
  operator = ZAMMAddress,
  source,
}: {
  owner: Address | undefined;
  operator: Address;
  source: CoinSource;
}) => {
  return useReadContract({
    address: source === "ZAMM" ? ZAMMAddress : CookbookAddress,
    abi: source === "ZAMM" ? ZAMMAbi : CookbookAbi,
    functionName: "isOperator",
    args: owner ? [owner, operator] : undefined,
  });
};
