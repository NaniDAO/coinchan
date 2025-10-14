import { encodePacked, keccak256 } from "viem";

const NO_PREFIX = "PMARKET:NO";

export const calculateNoTokenId = (yesId: bigint): bigint => {
  const digest = keccak256(
    encodePacked(["string", "uint256"], [NO_PREFIX, yesId]),
  );
  return BigInt(digest);
};
