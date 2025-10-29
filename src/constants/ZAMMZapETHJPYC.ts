import type { Address } from "viem";

/**
 * ZAMMZapETHJPYC - One-step zapper for ETH → JPYC → LP
 *
 * This contract forces ETH→USDC→JPYC routing to use liquid external pools
 * (Uniswap V3/V4 USDC/JPYC) instead of the illiquid ETH/JPYC pool on ZAMM.
 * Executes the zap in a single transaction via zQuoter and zRouter.
 * Also sweeps JPYC, USDC, and ETH dust back to the user.
 *
 * Contract deployed at: 0xe1e2D40807d37f158b12824a48aA00C2CF1c6af2
 */
export const ZAMMZapETHJPYCAddress: Address = "0xe1e2D40807d37f158b12824a48aA00C2CF1c6af2";

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
