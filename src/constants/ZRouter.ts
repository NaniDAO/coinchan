import { Address } from "viem";

export const ZRouterAddress = "0x0000000000404FECAf36E6184245475eE1254835" as Address;
export const ZRouterAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "payable",
  },
  {
    type: "fallback",
    stateMutability: "payable",
  },
  {
    type: "receive",
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "ensureAllowance",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "swapV2",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "exactOut",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "tokenIn",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenOut",
        type: "address",
        internalType: "address",
      },
      {
        name: "swapAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountLimit",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "amountIn",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountOut",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "swapV3",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "exactOut",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "swapFee",
        type: "uint24",
        internalType: "uint24",
      },
      {
        name: "tokenIn",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenOut",
        type: "address",
        internalType: "address",
      },
      {
        name: "swapAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountLimit",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "amountIn",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountOut",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "swapV4",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "exactOut",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "swapFee",
        type: "uint24",
        internalType: "uint24",
      },
      {
        name: "tickSpace",
        type: "int24",
        internalType: "int24",
      },
      {
        name: "tokenIn",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenOut",
        type: "address",
        internalType: "address",
      },
      {
        name: "swapAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountLimit",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "amountIn",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountOut",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "swapZAMM",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address",
      },
      {
        name: "exactOut",
        type: "bool",
        internalType: "bool",
      },
      {
        name: "feeOrHook",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "tokenIn",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenOut",
        type: "address",
        internalType: "address",
      },
      {
        name: "idIn",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "idOut",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "swapAmount",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountLimit",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    outputs: [
      {
        name: "amountIn",
        type: "uint256",
        internalType: "uint256",
      },
      {
        name: "amountOut",
        type: "uint256",
        internalType: "uint256",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "unlockCallback",
    inputs: [
      {
        name: "callbackData",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    outputs: [
      {
        name: "",
        type: "bytes",
        internalType: "bytes",
      },
    ],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "v2PoolFor",
    inputs: [
      {
        name: "tokenA",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenB",
        type: "address",
        internalType: "address",
      },
    ],
    outputs: [
      {
        name: "v2pool",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "function",
    name: "v3PoolFor",
    inputs: [
      {
        name: "tokenA",
        type: "address",
        internalType: "address",
      },
      {
        name: "tokenB",
        type: "address",
        internalType: "address",
      },
      {
        name: "fee",
        type: "uint24",
        internalType: "uint24",
      },
    ],
    outputs: [
      {
        name: "v3pool",
        type: "address",
        internalType: "address",
      },
    ],
    stateMutability: "pure",
  },
  {
    type: "error",
    name: "BadSwap",
    inputs: [],
  },
  {
    type: "error",
    name: "Expired",
    inputs: [],
  },
  {
    type: "error",
    name: "Slippage",
    inputs: [],
  },
  {
    type: "error",
    name: "Unauthorized",
    inputs: [],
  },
] as const;
