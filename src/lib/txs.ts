import {
  Address,
  encodeFunctionData,
  erc20Abi,
  Hex,
  maxUint256,
  PublicClient,
  zeroAddress,
} from "viem";
import { Token } from "./pools";
import { erc6909Abi } from "zrouter-sdk";

export type ERC20ApprovalNeed = {
  kind: "erc20";
  token: Address;
  spender: Address;
  required: bigint;
  has: bigint;
  callData: Hex;
};

export type OperatorApprovalNeed = {
  kind: "erc6909";
  operator: Address;
  on: Address;
  enabled: boolean;
  callData: Hex;
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
      const callData = encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, maxUint256],
      });

      return {
        kind: "erc20",
        token: token.address,
        spender,
        required,
        has: approvalRequired,
        callData,
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
    callData: encodeFunctionData({
      abi: erc6909Abi,
      functionName: "setOperator",
      args: [spender, true],
    }),
  };
};
