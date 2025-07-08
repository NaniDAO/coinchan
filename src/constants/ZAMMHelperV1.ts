import type { Address } from "viem";

// Interface for the ZAMMHelper contract at 0xD3791C4Db2F20f198c77eDb70157085cB963D7f2
export const ZAMMHelperV1Address = "0xD3791C4Db2F20f198c77eDb70157085cB963D7f2" as Address;

export const ZAMMHelperV1Abi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  {
    inputs: [
      {
        components: [
          { internalType: "uint256", name: "id0", type: "uint256" },
          { internalType: "uint256", name: "id1", type: "uint256" },
          { internalType: "address", name: "token0", type: "address" },
          { internalType: "address", name: "token1", type: "address" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
        ],
        internalType: "struct IZAMM.PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      { internalType: "uint256", name: "amount0Desired", type: "uint256" },
      { internalType: "uint256", name: "amount1Desired", type: "uint256" },
    ],
    name: "calculateRequiredETH",
    outputs: [
      { internalType: "uint256", name: "ethAmount", type: "uint256" },
      { internalType: "uint256", name: "amount0", type: "uint256" },
      { internalType: "uint256", name: "amount1", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint256", name: "id0", type: "uint256" },
          { internalType: "uint256", name: "id1", type: "uint256" },
          { internalType: "address", name: "token0", type: "address" },
          { internalType: "address", name: "token1", type: "address" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
        ],
        internalType: "struct IZAMM.PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      { internalType: "uint256", name: "amount0Desired", type: "uint256" },
      { internalType: "uint256", name: "amount1Desired", type: "uint256" },
    ],
    name: "calculateRequiredETHForToken1",
    outputs: [
      { internalType: "uint256", name: "ethAmount", type: "uint256" },
      { internalType: "uint256", name: "amount0", type: "uint256" },
      { internalType: "uint256", name: "amount1", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "uint256", name: "id0", type: "uint256" },
          { internalType: "uint256", name: "id1", type: "uint256" },
          { internalType: "address", name: "token0", type: "address" },
          { internalType: "address", name: "token1", type: "address" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
        ],
        internalType: "struct IZAMM.PoolKey",
        name: "poolKey",
        type: "tuple",
      },
    ],
    name: "getPoolId",
    outputs: [{ internalType: "uint256", name: "poolId", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
] as const;
