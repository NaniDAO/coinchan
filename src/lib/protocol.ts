import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";

export const protocols = [
  { id: "ZAMMV0", label: "zamm V0 position" },
  { id: "ZAMMV1", label: "zamm V1 position" },
] as const;

export type ProtocolOption = (typeof protocols)[number];
export type ProtocolId = ProtocolOption["id"];

export const getProtocol = (id: ProtocolId) => {
  if (id === "ZAMMV0") {
    return {
      address: ZAMMAddress,
      abi: ZAMMAbi,
    };
  } else if (id === "ZAMMV1") {
    return {
      address: CookbookAddress,
      abi: CookbookAbi,
    };
  }

  return null;
};
