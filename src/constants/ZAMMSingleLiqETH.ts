import type { Address } from "viem";

// ZAMMSingleLiqETH contract constants
export const ZAMMSingleLiqETHAddress: Address = "0x7c1E515F1c7F1c4909206BD92F6A4BFc0138E58b";

// Properly typed ABI with documentation
export const ZAMMSingleLiqETHAbi = [
  {
    inputs: [],
    name: "InvalidPoolKey",
    type: "error",
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
        internalType: "struct PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      {
        internalType: "uint256",
        name: "amountOutMin",
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
    name: "addSingleLiqETH",
    outputs: [
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
      {
        internalType: "uint256",
        name: "liquidity",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;
