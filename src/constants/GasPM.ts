// GasPM - Gas Price Prediction Markets
// Tracks Ethereum base fee and creates prediction markets via Resolver + PAMM
export const GasPMAddress = "0x0000000000ee3d4294438093EaA34308f47Bc0b4" as const;

// Market type identifiers (from MarketCreated event op field)
export enum GasPMMarketType {
  DIRECTIONAL_LTE = 2, // TWAP <= threshold
  DIRECTIONAL_GTE = 3, // TWAP >= threshold
  RANGE = 4, // TWAP in range
  BREAKOUT = 5, // TWAP out of range
  PEAK = 6, // Max reaches threshold
  TROUGH = 7, // Min reaches threshold
  VOLATILITY = 8, // Spread >= threshold
  STABILITY = 9, // Spread <= threshold
  SPOT = 10, // Spot price at resolution
  COMPARISON = 11, // TWAP higher than start
}

export const GasPMAbi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  { inputs: [], name: "AlreadyBelowThreshold", type: "error" },
  { inputs: [], name: "AlreadyExceeded", type: "error" },
  { inputs: [], name: "ApproveFailed", type: "error" },
  { inputs: [], name: "ETHTransferFailed", type: "error" },
  { inputs: [], name: "InvalidClose", type: "error" },
  { inputs: [], name: "InvalidCooldown", type: "error" },
  { inputs: [], name: "InvalidETHAmount", type: "error" },
  { inputs: [], name: "InvalidOp", type: "error" },
  { inputs: [], name: "InvalidThreshold", type: "error" },
  { inputs: [], name: "MarketIdMismatch", type: "error" },
  { inputs: [], name: "Reentrancy", type: "error" },
  { inputs: [], name: "ResolverCallFailed", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "TransferFromFailed", type: "error" },
  { inputs: [], name: "Unauthorized", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "threshold", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "threshold2", type: "uint256" },
      { indexed: false, internalType: "uint64", name: "close", type: "uint64" },
      { indexed: false, internalType: "bool", name: "canClose", type: "bool" },
      { indexed: false, internalType: "uint8", name: "op", type: "uint8" },
    ],
    name: "MarketCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "previousOwner", type: "address" },
      { indexed: true, internalType: "address", name: "newOwner", type: "address" },
    ],
    name: "OwnershipTransferred",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [{ indexed: false, internalType: "bool", name: "enabled", type: "bool" }],
    name: "PublicCreationSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "rewardAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "cooldown", type: "uint256" },
    ],
    name: "RewardConfigured",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint64", name: "timestamp", type: "uint64" },
      { indexed: false, internalType: "uint256", name: "baseFee", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "cumulativeBaseFee", type: "uint256" },
      { indexed: true, internalType: "address", name: "updater", type: "address" },
      { indexed: false, internalType: "uint256", name: "reward", type: "uint256" },
    ],
    name: "Updated",
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
    inputs: [],
    name: "RESOLVER",
    outputs: [{ internalType: "address payable", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "baseFeeAverage",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "baseFeeAverageSince",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "baseFeeCurrent",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "baseFeeHigherThanStart",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
    ],
    name: "baseFeeInRange",
    outputs: [{ internalType: "uint256", name: "r", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
    ],
    name: "baseFeeInRangeSince",
    outputs: [{ internalType: "uint256", name: "r", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "baseFeeMax",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "baseFeeMaxSince",
    outputs: [{ internalType: "uint256", name: "m", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "baseFeeMin",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "baseFeeMinSince",
    outputs: [{ internalType: "uint256", name: "m", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
    ],
    name: "baseFeeOutOfRange",
    outputs: [{ internalType: "uint256", name: "r", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
    ],
    name: "baseFeeOutOfRangeSince",
    outputs: [{ internalType: "uint256", name: "r", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "baseFeeSpread",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "baseFeeSpreadSince",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "comparisonStartValue",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "cooldown",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createBreakoutMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createComparisonMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint8", name: "op", type: "uint8" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint8", name: "op", type: "uint8" },
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
        internalType: "struct GasPM.SeedParams",
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
        internalType: "struct GasPM.SwapParams",
        name: "swap",
        type: "tuple",
      },
    ],
    name: "createMarketAndBuy",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "swapOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createPeakMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createRangeMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
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
        internalType: "struct GasPM.SeedParams",
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
        internalType: "struct GasPM.SwapParams",
        name: "swap",
        type: "tuple",
      },
    ],
    name: "createRangeMarketAndBuy",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "swapOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createSpotMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createStabilityMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createTroughMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createVolatilityMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowBreakoutMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint8", name: "op", type: "uint8" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint8", name: "op", type: "uint8" },
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
        internalType: "struct GasPM.SeedParams",
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
        internalType: "struct GasPM.SwapParams",
        name: "swap",
        type: "tuple",
      },
    ],
    name: "createWindowMarketAndBuy",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "swapOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowPeakMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowRangeMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "lower", type: "uint256" },
      { internalType: "uint256", name: "upper", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
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
        internalType: "struct GasPM.SeedParams",
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
        internalType: "struct GasPM.SwapParams",
        name: "swap",
        type: "tuple",
      },
    ],
    name: "createWindowRangeMarketAndBuy",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "swapOut", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowStabilityMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowTroughMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "threshold", type: "uint256" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "lpRecipient", type: "address" },
    ],
    name: "createWindowVolatilityMarket",
    outputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "cumulativeBaseFee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "start", type: "uint256" },
      { internalType: "uint256", name: "count", type: "uint256" },
    ],
    name: "getMarketInfos",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "marketId", type: "uint256" },
          { internalType: "uint64", name: "close", type: "uint64" },
          { internalType: "bool", name: "resolved", type: "bool" },
          { internalType: "bool", name: "outcome", type: "bool" },
          { internalType: "uint256", name: "currentValue", type: "uint256" },
          { internalType: "bool", name: "conditionMet", type: "bool" },
          { internalType: "bool", name: "ready", type: "bool" },
        ],
        internalType: "struct GasPM.MarketInfo[]",
        name: "infos",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "start", type: "uint256" },
      { internalType: "uint256", name: "count", type: "uint256" },
    ],
    name: "getMarkets",
    outputs: [{ internalType: "uint256[]", name: "ids", type: "uint256[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "start", type: "uint256" },
      { internalType: "uint256", name: "count", type: "uint256" },
    ],
    name: "getObservations",
    outputs: [
      {
        components: [
          { internalType: "uint64", name: "timestamp", type: "uint64" },
          { internalType: "uint64", name: "baseFee", type: "uint64" },
          { internalType: "uint128", name: "cumulativeBaseFee", type: "uint128" },
        ],
        internalType: "struct GasPM.Observation[]",
        name: "obs",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "isOurMarket",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "lastBaseFee",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "lastUpdateTime",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "marketCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "marketSnapshots",
    outputs: [
      { internalType: "uint192", name: "cumulative", type: "uint192" },
      { internalType: "uint64", name: "timestamp", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxBaseFee",
    outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "minBaseFee",
    outputs: [{ internalType: "uint128", name: "", type: "uint128" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes[]", name: "data", type: "bytes[]" }],
    name: "multicall",
    outputs: [{ internalType: "bytes[]", name: "results", type: "bytes[]" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "observationCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "observations",
    outputs: [
      { internalType: "uint64", name: "timestamp", type: "uint64" },
      { internalType: "uint64", name: "baseFee", type: "uint64" },
      { internalType: "uint128", name: "cumulativeBaseFee", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "token", type: "address" },
      { internalType: "address", name: "owner_", type: "address" },
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
      { internalType: "address", name: "owner_", type: "address" },
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
    name: "pokeWindowVolatility",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256[]", name: "marketIds", type: "uint256[]" }],
    name: "pokeWindowVolatilityBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "publicCreation",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "rewardAmount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bool", name: "enabled", type: "bool" }],
    name: "setPublicCreation",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "_rewardAmount", type: "uint256" },
      { internalType: "uint256", name: "_cooldown", type: "uint256" },
    ],
    name: "setReward",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "startTime",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "newOwner", type: "address" }],
    name: "transferOwnership",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { inputs: [], name: "update", outputs: [], stateMutability: "nonpayable", type: "function" },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "windowSpreads",
    outputs: [
      { internalType: "uint128", name: "windowMax", type: "uint128" },
      { internalType: "uint128", name: "windowMin", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

/**
 * Check if a resolver address is the GasPM oracle
 */
export function isGasPMResolver(resolverAddress: string): boolean {
  return resolverAddress.toLowerCase() === GasPMAddress.toLowerCase();
}

/**
 * Format wei to gwei string (e.g., 50000000000 => "50")
 */
export function formatGwei(wei: bigint): string {
  const gwei = wei / 1_000_000_000n;
  const remainder = (wei % 1_000_000_000n) / 1_000_000n;

  if (remainder === 0n) {
    return gwei.toString();
  }

  // Format with up to 3 decimal places, trimming trailing zeros
  let decimals = remainder.toString().padStart(3, "0");
  decimals = decimals.replace(/0+$/, "");

  return `${gwei}.${decimals}`;
}

/**
 * Get human-readable market type name
 */
export function getMarketTypeName(op: number): string {
  switch (op) {
    case GasPMMarketType.DIRECTIONAL_LTE:
      return "Directional (<=)";
    case GasPMMarketType.DIRECTIONAL_GTE:
      return "Directional (>=)";
    case GasPMMarketType.RANGE:
      return "Range";
    case GasPMMarketType.BREAKOUT:
      return "Breakout";
    case GasPMMarketType.PEAK:
      return "Peak";
    case GasPMMarketType.TROUGH:
      return "Trough";
    case GasPMMarketType.VOLATILITY:
      return "Volatility";
    case GasPMMarketType.STABILITY:
      return "Stability";
    case GasPMMarketType.SPOT:
      return "Spot";
    case GasPMMarketType.COMPARISON:
      return "Comparison";
    default:
      return "Unknown";
  }
}
