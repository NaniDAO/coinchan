import type { Address } from "viem";

// CULTSingleLiqETH contract constants
export const CULTSingleLiqETHAddress: Address = "0x3461b5bb5ce7192ddc901aee8a9ecf8b6740cef4";

// Same ABI as ZAMMSingleLiqETH - using identical interface
export const CULTSingleLiqETHAbi = [
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
            internalType: "uint256",
            name: "feeOrHook",
            type: "uint256",
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
