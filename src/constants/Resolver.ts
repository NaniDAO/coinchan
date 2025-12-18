// Resolver Singleton - On-chain oracle for PAMM markets
export const ResolverAddress = "0x00000000002205020E387b6a378c05639047BcFB" as const;

// Operation types for conditions
export enum ResolverOp {
  LT = 0, // <
  GT = 1, // >
  LTE = 2, // <=
  GTE = 3, // >=
  EQ = 4, // ==
  NEQ = 5, // !=
}

export const ResolverAbi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  { inputs: [], name: "ApproveFailed", type: "error" },
  { inputs: [], name: "ConditionExists", type: "error" },
  { inputs: [], name: "ETHTransferFailed", type: "error" },
  { inputs: [], name: "InvalidDeadline", type: "error" },
  { inputs: [], name: "InvalidETHAmount", type: "error" },
  { inputs: [], name: "InvalidTarget", type: "error" },
  { inputs: [], name: "MarketResolved", type: "error" },
  { inputs: [], name: "MulDivFailed", type: "error" },
  { inputs: [], name: "NotResolverMarket", type: "error" },
  { inputs: [], name: "Pending", type: "error" },
  { inputs: [], name: "Reentrancy", type: "error" },
  { inputs: [], name: "TargetCallFailed", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "TransferFromFailed", type: "error" },
  { inputs: [], name: "Unknown", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "targetA", type: "address" },
      { indexed: false, internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "threshold", type: "uint256" },
      { indexed: false, internalType: "uint64", name: "close", type: "uint64" },
      { indexed: false, internalType: "bool", name: "canClose", type: "bool" },
      { indexed: false, internalType: "bool", name: "isRatio", type: "bool" },
      { indexed: false, internalType: "string", name: "description", type: "string" },
    ],
    name: "ConditionCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "targetA", type: "address" },
      { indexed: false, internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { indexed: false, internalType: "uint256", name: "threshold", type: "uint256" },
      { indexed: false, internalType: "uint64", name: "close", type: "uint64" },
      { indexed: false, internalType: "bool", name: "canClose", type: "bool" },
      { indexed: false, internalType: "bool", name: "isRatio", type: "bool" },
    ],
    name: "ConditionRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "collateralIn", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "shares", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "liquidity", type: "uint256" },
      { indexed: false, internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "MarketSeeded",
    type: "event",
  },
  {
    inputs: [],
    name: "PAMM",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "buildDescription",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "conditions",
    outputs: [
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "bool", name: "isRatio", type: "bool" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "bytes", name: "callDataA", type: "bytes" },
      { internalType: "bytes", name: "callDataB", type: "bytes" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "callData", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "createNumericMarket",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "callData", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      {
        components: [
          { internalType: "uint256", name: "collateralIn", type: "uint256" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "uint256", name: "minLiquidity", type: "uint256" },
          { internalType: "address", name: "lpRecipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct Resolver.SeedParams",
        name: "seed",
        type: "tuple",
      },
    ],
    name: "createNumericMarketAndSeed",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes4", name: "selector", type: "bytes4" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "createNumericMarketSimple",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes4", name: "selector", type: "bytes4" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      {
        components: [
          { internalType: "uint256", name: "collateralIn", type: "uint256" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "uint256", name: "minLiquidity", type: "uint256" },
          { internalType: "address", name: "lpRecipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct Resolver.SeedParams",
        name: "seed",
        type: "tuple",
      },
    ],
    name: "createNumericMarketAndSeedSimple",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "callData", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      {
        components: [
          { internalType: "uint256", name: "collateralIn", type: "uint256" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "uint256", name: "minLiquidity", type: "uint256" },
          { internalType: "address", name: "lpRecipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct Resolver.SeedParams",
        name: "seed",
        type: "tuple",
      },
      {
        components: [
          { internalType: "uint256", name: "collateralForSwap", type: "uint256" },
          { internalType: "uint256", name: "minOut", type: "uint256" },
          { internalType: "bool", name: "yesForNo", type: "bool" },
          { internalType: "address", name: "recipient", type: "address" },
        ],
        internalType: "struct Resolver.SwapParams",
        name: "swap",
        type: "tuple",
      },
    ],
    name: "createNumericMarketSeedAndBuy",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
      { internalType: "uint256", name: "swapOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes", name: "callDataA", type: "bytes" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes", name: "callDataB", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "createRatioMarket",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes", name: "callDataA", type: "bytes" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes", name: "callDataB", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      {
        components: [
          { internalType: "uint256", name: "collateralIn", type: "uint256" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "uint256", name: "minLiquidity", type: "uint256" },
          { internalType: "address", name: "lpRecipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct Resolver.SeedParams",
        name: "seed",
        type: "tuple",
      },
    ],
    name: "createRatioMarketAndSeed",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes4", name: "selectorA", type: "bytes4" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes4", name: "selectorB", type: "bytes4" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "createRatioMarketSimple",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes4", name: "selectorA", type: "bytes4" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes4", name: "selectorB", type: "bytes4" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      {
        components: [
          { internalType: "uint256", name: "collateralIn", type: "uint256" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "uint256", name: "minLiquidity", type: "uint256" },
          { internalType: "address", name: "lpRecipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct Resolver.SeedParams",
        name: "seed",
        type: "tuple",
      },
    ],
    name: "createRatioMarketAndSeedSimple",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "observable", type: "string" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes", name: "callDataA", type: "bytes" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes", name: "callDataB", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      {
        components: [
          { internalType: "uint256", name: "collateralIn", type: "uint256" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "uint256", name: "minLiquidity", type: "uint256" },
          { internalType: "address", name: "lpRecipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct Resolver.SeedParams",
        name: "seed",
        type: "tuple",
      },
      {
        components: [
          { internalType: "uint256", name: "collateralForSwap", type: "uint256" },
          { internalType: "uint256", name: "minOut", type: "uint256" },
          { internalType: "bool", name: "yesForNo", type: "bool" },
          { internalType: "address", name: "recipient", type: "address" },
        ],
        internalType: "struct Resolver.SwapParams",
        name: "swap",
        type: "tuple",
      },
    ],
    name: "createRatioMarketSeedAndBuy",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
      { internalType: "uint256", name: "swapOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes[]", name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [{ internalType: "bytes[]", name: "results", type: "bytes[]" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "permit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "bool", name: "allowed", type: "bool" },
      { internalType: "uint8", name: "v", type: "uint8" },
      { internalType: "bytes32", name: "r", type: "bytes32" },
      { internalType: "bytes32", name: "s", type: "bytes32" },
    ],
    name: "permitDAI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "preview",
    outputs: [
      { internalType: "uint256", name: "value", type: "uint256" },
      { internalType: "bool", name: "condTrue", type: "bool" },
      { internalType: "bool", name: "ready", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes", name: "callData", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
    ],
    name: "registerConditionForExistingMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "address", name: "target", type: "address" },
      { internalType: "bytes4", name: "selector", type: "bytes4" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
    ],
    name: "registerConditionForExistingMarketSimple",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes", name: "callDataA", type: "bytes" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes", name: "callDataB", type: "bytes" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
    ],
    name: "registerRatioConditionForExistingMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "address", name: "targetA", type: "address" },
      { internalType: "bytes4", name: "selectorA", type: "bytes4" },
      { internalType: "address", name: "targetB", type: "address" },
      { internalType: "bytes4", name: "selectorB", type: "bytes4" },
      { internalType: "enum Resolver.Op", name: "op", type: "uint8" },
      { internalType: "uint256", name: "threshold", type: "uint256" },
    ],
    name: "registerRatioConditionForExistingMarketSimple",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "resolveMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

/**
 * Convert Op enum to symbol string
 */
export function opToSymbol(op: ResolverOp): string {
  switch (op) {
    case ResolverOp.LT:
      return "<";
    case ResolverOp.GT:
      return ">";
    case ResolverOp.LTE:
      return "<=";
    case ResolverOp.GTE:
      return ">=";
    case ResolverOp.EQ:
      return "==";
    case ResolverOp.NEQ:
      return "!=";
    default:
      return "?";
  }
}

/**
 * Check if a resolver address is the Resolver singleton
 */
export function isResolverSingleton(resolverAddress: string): boolean {
  return resolverAddress.toLowerCase() === ResolverAddress.toLowerCase();
}
