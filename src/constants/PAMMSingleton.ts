import { keccak256, encodePacked } from "viem";

// PAMM V1 Singleton - ERC6909 prediction market shares
export const PAMMSingletonAddress = "0x000000000044bfe6c2BBFeD8862973E0612f07C0" as const;

// ZAMM address used by PAMM
export const ZAMM_ADDRESS = "0x000000000000040470635EB91b7CE4D132D616eD" as const;

// ABI for PAMM singleton - minimal subset needed for pool detection
export const PAMMSingletonAbi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  { inputs: [], name: "AlreadyResolved", type: "error" },
  { inputs: [], name: "AmountZero", type: "error" },
  { inputs: [], name: "DeadlineExpired", type: "error" },
  { inputs: [], name: "ETHTransferFailed", type: "error" },
  { inputs: [], name: "ExcessiveInput", type: "error" },
  { inputs: [], name: "FeeOverflow", type: "error" },
  { inputs: [], name: "InsufficientOutput", type: "error" },
  { inputs: [], name: "InvalidClose", type: "error" },
  { inputs: [], name: "InvalidETHAmount", type: "error" },
  { inputs: [], name: "InvalidReceiver", type: "error" },
  { inputs: [], name: "InvalidResolver", type: "error" },
  { inputs: [], name: "InvalidSwapAmount", type: "error" },
  { inputs: [], name: "MarketClosed", type: "error" },
  { inputs: [], name: "MarketExists", type: "error" },
  { inputs: [], name: "MarketNotClosed", type: "error" },
  { inputs: [], name: "MarketNotFound", type: "error" },
  { inputs: [], name: "NotClosable", type: "error" },
  { inputs: [], name: "OnlyResolver", type: "error" },
  { inputs: [], name: "Reentrancy", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "TransferFromFailed", type: "error" },
  { inputs: [], name: "WrongCollateralType", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "address", name: "spender", type: "address" },
      { indexed: true, internalType: "uint256", name: "id", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "Approval",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "shares", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "payout", type: "uint256" },
    ],
    name: "Claimed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "ts", type: "uint256" },
      { indexed: true, internalType: "address", name: "by", type: "address" },
    ],
    name: "Closed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "noId", type: "uint256" },
      { indexed: false, internalType: "string", name: "description", type: "string" },
      { indexed: false, internalType: "address", name: "resolver", type: "address" },
      { indexed: false, internalType: "address", name: "collateral", type: "address" },
      { indexed: false, internalType: "uint64", name: "close", type: "uint64" },
      { indexed: false, internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "Created",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "shares", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "collateralOut", type: "uint256" },
    ],
    name: "Merged",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "address", name: "operator", type: "address" },
      { indexed: false, internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "OperatorSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "bool", name: "outcome", type: "bool" },
    ],
    name: "Resolved",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "resolver", type: "address" },
      { indexed: false, internalType: "uint16", name: "bps", type: "uint16" },
    ],
    name: "ResolverFeeSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "user", type: "address" },
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "shares", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "collateralIn", type: "uint256" },
    ],
    name: "Split",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "address", name: "caller", type: "address" },
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint256", name: "id", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "Transfer",
    type: "event",
  },
  {
    inputs: [],
    name: "ZAMM",
    outputs: [{ internalType: "contract IZAMM", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "allMarkets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    name: "allowance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "spender", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "minNoOut", type: "uint256" },
      { internalType: "uint256", name: "minSwapOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "buyNo",
    outputs: [{ internalType: "uint256", name: "noOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "minYesOut", type: "uint256" },
      { internalType: "uint256", name: "minSwapOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "buyYes",
    outputs: [{ internalType: "uint256", name: "yesOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "claim",
    outputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "payout", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256[]", name: "marketIds", type: "uint256[]" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "claimMany",
    outputs: [{ internalType: "uint256", name: "totalPayout", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "closeMarket",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "description", type: "string" },
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
    ],
    name: "createMarket",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "description", type: "string" },
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "createMarketAndSeed",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "descriptions",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "getMarket",
    outputs: [
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "outcome", type: "bool" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "uint256", name: "collateralLocked", type: "uint256" },
      { internalType: "uint256", name: "yesSupply", type: "uint256" },
      { internalType: "uint256", name: "noSupply", type: "uint256" },
      { internalType: "string", name: "description", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "description", type: "string" },
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "address", name: "collateral", type: "address" },
    ],
    name: "getMarketId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "start", type: "uint256" },
      { internalType: "uint256", name: "count", type: "uint256" },
    ],
    name: "getMarkets",
    outputs: [
      { internalType: "uint256[]", name: "marketIds", type: "uint256[]" },
      { internalType: "address[]", name: "resolvers", type: "address[]" },
      { internalType: "address[]", name: "collaterals", type: "address[]" },
      { internalType: "uint8[]", name: "states", type: "uint8[]" },
      { internalType: "uint64[]", name: "closes", type: "uint64[]" },
      { internalType: "uint256[]", name: "collateralAmounts", type: "uint256[]" },
      { internalType: "uint256[]", name: "yesSupplies", type: "uint256[]" },
      { internalType: "uint256[]", name: "noSupplies", type: "uint256[]" },
      { internalType: "string[]", name: "descs", type: "string[]" },
      { internalType: "uint256", name: "next", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256[]", name: "ids", type: "uint256[]" }],
    name: "getMarketsByIds",
    outputs: [
      { internalType: "address[]", name: "resolvers", type: "address[]" },
      { internalType: "address[]", name: "collaterals", type: "address[]" },
      { internalType: "uint8[]", name: "states", type: "uint8[]" },
      { internalType: "uint64[]", name: "closes", type: "uint64[]" },
      { internalType: "uint256[]", name: "collateralAmounts", type: "uint256[]" },
      { internalType: "uint256[]", name: "yesSupplies", type: "uint256[]" },
      { internalType: "uint256[]", name: "noSupplies", type: "uint256[]" },
      { internalType: "string[]", name: "descs", type: "string[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "getNoId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
    ],
    name: "getPoolState",
    outputs: [
      { internalType: "uint256", name: "rYes", type: "uint256" },
      { internalType: "uint256", name: "rNo", type: "uint256" },
      { internalType: "uint256", name: "pYesNum", type: "uint256" },
      { internalType: "uint256", name: "pYesDen", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "start", type: "uint256" },
      { internalType: "uint256", name: "count", type: "uint256" },
    ],
    name: "getUserPositions",
    outputs: [
      { internalType: "uint256[]", name: "marketIds", type: "uint256[]" },
      { internalType: "uint256[]", name: "noIds", type: "uint256[]" },
      { internalType: "address[]", name: "collaterals", type: "address[]" },
      { internalType: "uint256[]", name: "yesBalances", type: "uint256[]" },
      { internalType: "uint256[]", name: "noBalances", type: "uint256[]" },
      { internalType: "uint256[]", name: "claimables", type: "uint256[]" },
      { internalType: "bool[]", name: "isResolved", type: "bool[]" },
      { internalType: "bool[]", name: "isOpen", type: "bool[]" },
      { internalType: "uint256", name: "next", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "isOperator",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
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
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "markets",
    outputs: [
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "bool", name: "resolved", type: "bool" },
      { internalType: "bool", name: "outcome", type: "bool" },
      { internalType: "bool", name: "canClose", type: "bool" },
      { internalType: "uint64", name: "close", type: "uint64" },
      { internalType: "address", name: "collateral", type: "address" },
      { internalType: "uint256", name: "collateralLocked", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "merge",
    outputs: [
      { internalType: "uint256", name: "merged", type: "uint256" },
      { internalType: "uint256", name: "collateralOut", type: "uint256" },
    ],
    stateMutability: "nonpayable",
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
    inputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "pure",
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
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
    ],
    name: "poolKey",
    outputs: [
      {
        components: [
          { internalType: "uint256", name: "id0", type: "uint256" },
          { internalType: "uint256", name: "id1", type: "uint256" },
          { internalType: "address", name: "token0", type: "address" },
          { internalType: "address", name: "token1", type: "address" },
          { internalType: "uint256", name: "feeOrHook", type: "uint256" },
        ],
        internalType: "struct IZAMM.PoolKey",
        name: "key",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
      { internalType: "uint256", name: "amount0Min", type: "uint256" },
      { internalType: "uint256", name: "amount1Min", type: "uint256" },
      { internalType: "uint256", name: "minCollateralOut", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "removeLiquidityToCollateral",
    outputs: [
      { internalType: "uint256", name: "collateralOut", type: "uint256" },
      { internalType: "uint256", name: "leftoverYes", type: "uint256" },
      { internalType: "uint256", name: "leftoverNo", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "outcome", type: "bool" },
    ],
    name: "resolve",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "resolverFeeBps",
    outputs: [{ internalType: "uint16", name: "", type: "uint16" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noAmount", type: "uint256" },
      { internalType: "uint256", name: "swapAmount", type: "uint256" },
      { internalType: "uint256", name: "minCollateralOut", type: "uint256" },
      { internalType: "uint256", name: "minSwapOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sellNo",
    outputs: [{ internalType: "uint256", name: "collateralOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "collateralOut", type: "uint256" },
      { internalType: "uint256", name: "maxNoIn", type: "uint256" },
      { internalType: "uint256", name: "maxSwapIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sellNoForExactCollateral",
    outputs: [{ internalType: "uint256", name: "noSpent", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "yesAmount", type: "uint256" },
      { internalType: "uint256", name: "swapAmount", type: "uint256" },
      { internalType: "uint256", name: "minCollateralOut", type: "uint256" },
      { internalType: "uint256", name: "minSwapOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sellYes",
    outputs: [{ internalType: "uint256", name: "collateralOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "collateralOut", type: "uint256" },
      { internalType: "uint256", name: "maxYesIn", type: "uint256" },
      { internalType: "uint256", name: "maxSwapIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sellYesForExactCollateral",
    outputs: [{ internalType: "uint256", name: "yesSpent", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "operator", type: "address" },
      { internalType: "bool", name: "approved", type: "bool" },
    ],
    name: "setOperator",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint16", name: "bps", type: "uint16" }],
    name: "setResolverFeeBps",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "split",
    outputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "used", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "uint256", name: "amount0Min", type: "uint256" },
      { internalType: "uint256", name: "amount1Min", type: "uint256" },
      { internalType: "uint256", name: "minLiquidity", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "splitAndAddLiquidity",
    outputs: [
      { internalType: "uint256", name: "shares", type: "uint256" },
      { internalType: "uint256", name: "liquidity", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes4", name: "interfaceId", type: "bytes4" }],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "id", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "totalSupplyId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "tradingOpen",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "sender", type: "address" },
      { internalType: "address", name: "receiver", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "transferFrom",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "winningId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

/**
 * Derives the NO token id from a market id (matches PAMM.sol getNoId)
 * noId = keccak256("PMARKET:NO", marketId)
 */
export function deriveNoId(marketId: bigint): bigint {
  return BigInt(keccak256(encodePacked(["string", "uint256"], ["PMARKET:NO", marketId])));
}

/**
 * Checks if a token id could be a YES market id by verifying the corresponding
 * NO id derivation. This is a heuristic since we can't reverse the hash.
 */
export function isPotentialMarketId(id: bigint, otherId: bigint): boolean {
  // Check if id is the marketId (YES) and otherId is the noId (NO)
  const derivedNoId = deriveNoId(id);
  return derivedNoId === otherId;
}

/**
 * Given two token ids from a pool, determines which is YES (marketId) and which is NO (noId)
 * Returns { marketId, noId, yesIsId0 } or null if neither is a valid YES/NO pair
 */
export function identifyYesNoIds(
  id0: bigint,
  id1: bigint,
): { marketId: bigint; noId: bigint; yesIsId0: boolean } | null {
  // Check if id0 is marketId and id1 is noId
  if (isPotentialMarketId(id0, id1)) {
    return { marketId: id0, noId: id1, yesIsId0: true };
  }
  // Check if id1 is marketId and id0 is noId
  if (isPotentialMarketId(id1, id0)) {
    return { marketId: id1, noId: id0, yesIsId0: false };
  }
  return null;
}

/**
 * Calculates YES probability from pool reserves
 * YES% = rNo / (rYes + rNo)
 * This is because lower YES reserves means higher YES price (more demand)
 */
export function calculateYesProbability(rYes: bigint, rNo: bigint): { yesPercent: number; noPercent: number } {
  const total = rYes + rNo;
  if (total === 0n) {
    return { yesPercent: 50, noPercent: 50 };
  }
  // YES probability = rNo / total (inverse relationship in AMM)
  const yesPercent = (Number(rNo) / Number(total)) * 100;
  return {
    yesPercent,
    noPercent: 100 - yesPercent,
  };
}

/**
 * Decodes the packed state uint8 from getMarkets into individual booleans
 * state = (resolved ? 1 : 0) | (outcome ? 2 : 0) | (canClose ? 4 : 0)
 */
export function decodeMarketState(state: number): {
  resolved: boolean;
  outcome: boolean;
  canClose: boolean;
} {
  return {
    resolved: (state & 1) !== 0,
    outcome: (state & 2) !== 0,
    canClose: (state & 4) !== 0,
  };
}

/**
 * Default fee tier for PAMM pools (30 bps = 0.3%)
 */
export const DEFAULT_FEE_OR_HOOK = 30n;

/**
 * ETH sentinel value - when collateral is address(0), it means ETH
 */
export const ETH_COLLATERAL = "0x0000000000000000000000000000000000000000" as const;

/**
 * Check if collateral is ETH
 */
export function isETHCollateral(collateral: string): boolean {
  return collateral.toLowerCase() === ETH_COLLATERAL.toLowerCase();
}

// Legacy alias for backwards compatibility
export const PAMMAbi = PAMMSingletonAbi;
