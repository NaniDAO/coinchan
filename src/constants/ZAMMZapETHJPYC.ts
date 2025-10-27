import type { Address } from "viem";

/**
 * ZAMMZapETHJPYC - One-step zapper for ETH → JPYC → LP
 *
 * This contract leverages zQuoter and zRouter to automatically find the best
 * external source of JPYC (Uniswap V2/V3, Sushiswap, Curve, or ZAMM) and
 * executes the zap in a single transaction.
 *
 * Contract deployed at: 0x644C22269b0572f22a3FccB9CDE24B604F56eC03
 */
export const ZAMMZapETHJPYCAddress: Address = "0x644C22269b0572f22a3FccB9CDE24B604F56eC03";

export const ZAMMZapETHJPYCAbi = [
  // Errors
  {
    type: "error",
    name: "InvalidPoolKey",
    inputs: [],
  },
  {
    type: "error",
    name: "BadParams",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroQuote",
    inputs: [],
  },
  {
    type: "error",
    name: "DeadlineExpired",
    inputs: [],
  },
  // View function: previewZap
  {
    type: "function",
    name: "previewZap",
    inputs: [
      {
        name: "poolKey",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          {
            name: "id0",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "id1",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "token0",
            type: "address",
            internalType: "address",
          },
          {
            name: "token1",
            type: "address",
            internalType: "address",
          },
          {
            name: "feeOrHook",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "ethTotal",
        type: "uint256",
      },
      {
        name: "swapBps",
        type: "uint256",
      },
      {
        name: "slippageBps",
        type: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
      },
      {
        name: "to",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "ethSwap",
        type: "uint256",
      },
      {
        name: "ethLP",
        type: "uint256",
      },
      {
        name: "predictedJPYC",
        type: "uint256",
      },
      {
        name: "jpycForLP",
        type: "uint256",
      },
      {
        name: "finalCallsPrev",
        type: "bytes[]",
      },
    ],
    stateMutability: "view",
  },
  // Payable function: zapAndAddLiquidity
  {
    type: "function",
    name: "zapAndAddLiquidity",
    inputs: [
      {
        name: "poolKey",
        type: "tuple",
        internalType: "struct PoolKey",
        components: [
          {
            name: "id0",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "id1",
            type: "uint256",
            internalType: "uint256",
          },
          {
            name: "token0",
            type: "address",
            internalType: "address",
          },
          {
            name: "token1",
            type: "address",
            internalType: "address",
          },
          {
            name: "feeOrHook",
            type: "uint256",
            internalType: "uint256",
          },
        ],
      },
      {
        name: "swapBps",
        type: "uint256",
      },
      {
        name: "slippageBps",
        type: "uint256",
      },
      {
        name: "deadline",
        type: "uint256",
      },
      {
        name: "to",
        type: "address",
      },
    ],
    outputs: [
      {
        name: "liquidityMinted",
        type: "uint256",
      },
    ],
    stateMutability: "payable",
  },
] as const;
