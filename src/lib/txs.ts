import { Address, erc20Abi, PublicClient, zeroAddress } from "viem";
import { Token } from "./pools";
import { erc6909Abi } from "zrouter-sdk";

export type ERC20ApprovalNeed = {
  kind: "erc20";
  token: Address;
  spender: Address;
  required: bigint;
  has: bigint;
};

export type OperatorApprovalNeed = {
  kind: "erc6909";
  operator: Address;
  on: Address;
  enabled: boolean;
};

export type ApprovalNeed = ERC20ApprovalNeed | OperatorApprovalNeed;

export const getApprovalOrOperator = async (
  publicClient: PublicClient,
  {
    token,
    owner,
    spender,
    required,
  }: { token: Token; owner: Address; spender: Address; required: bigint },
): Promise<ApprovalNeed | null> => {
  const isETH = token.address === zeroAddress && token.id === 0n;
  if (isETH) {
    return null;
  }

  const isERC20 = token.address !== zeroAddress && token.id === 0n;

  if (isERC20) {
    const approvalRequired = await publicClient.readContract({
      abi: erc20Abi,
      address: token.address,
      functionName: "allowance",
      args: [owner, spender],
    });

    if (approvalRequired < required) {
      return {
        kind: "erc20",
        token: token.address,
        spender,
        required,
        has: approvalRequired,
      };
    }

    return null;
  }

  const isOperator = await publicClient.readContract({
    address: token.address,
    abi: erc6909Abi,
    functionName: "isOperator",
    args: [owner, spender],
  });

  if (isOperator) {
    return null;
  }

  return {
    kind: "erc6909",
    operator: spender,
    on: token.address,
    enabled: false,
  };
};
