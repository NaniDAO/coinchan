import { Address } from "viem";

// ZAMMSingleLiqETH V1 contract constants
export const ZAMMSingleLiqETHV1Address: Address = "0x0000000000Ee8cD7fd26236a2e4C1505dAc0Dce9";

// Properly typed ABI with documentation
export const ZAMMSingleLiqETHV1Abi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  { inputs: [], name: "InvalidPoolKey", type: "error" },
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
        internalType: "struct PoolKey",
        name: "poolKey",
        type: "tuple",
      },
      { internalType: "uint256", name: "amountOutMin", type: "uint256" },
      { internalType: "uint256", name: "amount0Min", type: "uint256" },
      { internalType: "uint256", name: "amount1Min", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "addSingleLiqETH",
    outputs: [
      { internalType: "uint256", name: "amount0", type: "uint256" },
      { internalType: "uint256", name: "amount1", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;
