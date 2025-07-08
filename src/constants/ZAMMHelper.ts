import type { Address } from "viem";

// Interface for the ZAMMHelper contract at 0xc4bfFdA77EB0E165220B0f18C8395db9Ce4b078F
export const ZAMMHelperAddress = "0xc4bfFdA77EB0E165220B0f18C8395db9Ce4b078F" as Address;

export const ZAMMHelperAbi = [
  {
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "id0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "id1",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "token0",
            type: "address",
          },
          {
            internalType: "address",
            name: "token1",
            type: "address",
          },
          {
            internalType: "uint96",
            name: "swapFee",
            type: "uint96",
          },
        ],
        internalType: "struct IZAMM.PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount0Desired",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1Desired",
        type: "uint256",
      },
    ],
    name: "calculateRequiredETH",
    outputs: [
      {
        internalType: "uint256",
        name: "ethAmount",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount0",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          {
            internalType: "uint256",
            name: "id0",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "id1",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "token0",
            type: "address",
          },
          {
            internalType: "address",
            name: "token1",
            type: "address",
          },
          {
            internalType: "uint96",
            name: "swapFee",
            type: "uint96",
          },
        ],
        internalType: "struct IZAMM.PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amount0Desired",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1Desired",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount0Min",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "amount1Min",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
      {
        internalType: "uint256",
        name: "deadline",
        type: "uint256",
      },
    ],
    name: "addLiquidityETH",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;
