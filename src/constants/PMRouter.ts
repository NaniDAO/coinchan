// PMRouter - Limit order and trading router for PAMM prediction markets
// Works with ZAMM orderbook for limit orders and PAMM AMM for market orders
export const PMRouterAddress = "0x000000000055fF709f26efB262fba8B0AE8c35Dc" as const;

export const PMRouterAbi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  { inputs: [], name: "AmountZero", type: "error" },
  { inputs: [], name: "ApproveFailed", type: "error" },
  { inputs: [], name: "DeadlineExpired", type: "error" },
  { inputs: [], name: "ETHTransferFailed", type: "error" },
  { inputs: [], name: "HashMismatch", type: "error" },
  { inputs: [], name: "InvalidETHAmount", type: "error" },
  { inputs: [], name: "InvalidFillAmount", type: "error" },
  { inputs: [], name: "MarketClosed", type: "error" },
  { inputs: [], name: "MarketNotFound", type: "error" },
  { inputs: [], name: "MustFillAll", type: "error" },
  { inputs: [], name: "NotOrderOwner", type: "error" },
  { inputs: [], name: "OrderExists", type: "error" },
  { inputs: [], name: "OrderInactive", type: "error" },
  { inputs: [], name: "OrderNotFound", type: "error" },
  { inputs: [], name: "Reentrancy", type: "error" },
  { inputs: [], name: "SlippageExceeded", type: "error" },
  { inputs: [], name: "TradingNotOpen", type: "error" },
  { inputs: [], name: "TransferFailed", type: "error" },
  { inputs: [], name: "TransferFromFailed", type: "error" },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "bytes32", name: "orderHash", type: "bytes32" }],
    name: "OrderCancelled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "orderHash", type: "bytes32" },
      { indexed: true, internalType: "address", name: "taker", type: "address" },
      { indexed: false, internalType: "uint96", name: "sharesFilled", type: "uint96" },
      { indexed: false, internalType: "uint96", name: "collateralFilled", type: "uint96" },
    ],
    name: "OrderFilled",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "orderHash", type: "bytes32" },
      { indexed: true, internalType: "uint256", name: "marketId", type: "uint256" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "bool", name: "isYes", type: "bool" },
      { indexed: false, internalType: "bool", name: "isBuy", type: "bool" },
      { indexed: false, internalType: "uint96", name: "shares", type: "uint96" },
      { indexed: false, internalType: "uint96", name: "collateral", type: "uint96" },
      { indexed: false, internalType: "uint56", name: "deadline", type: "uint56" },
      { indexed: false, internalType: "bool", name: "partialFill", type: "bool" },
    ],
    name: "OrderPlaced",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "orderHash", type: "bytes32" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint96", name: "amount", type: "uint96" },
    ],
    name: "ProceedsClaimed",
    type: "event",
  },
  {
    inputs: [],
    name: "PAMM",
    outputs: [{ internalType: "contract IPAMM", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "ZAMM",
    outputs: [{ internalType: "contract IZAMM", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "minSharesOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "buy",
    outputs: [{ internalType: "uint256", name: "sharesOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "orderHash", type: "bytes32" }],
    name: "cancelOrder",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "claim",
    outputs: [{ internalType: "uint256", name: "payout", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "orderHash", type: "bytes32" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "claimProceeds",
    outputs: [{ internalType: "uint96", name: "amount", type: "uint96" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "claimedOut",
    outputs: [{ internalType: "uint96", name: "", type: "uint96" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "bytes32", name: "orderHash", type: "bytes32" },
      { internalType: "uint96", name: "sharesToFill", type: "uint96" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "fillOrder",
    outputs: [
      { internalType: "uint96", name: "sharesFilled", type: "uint96" },
      { internalType: "uint96", name: "collateralFilled", type: "uint96" },
    ],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "bool", name: "isBuy", type: "bool" },
      { internalType: "uint256", name: "totalAmount", type: "uint256" },
      { internalType: "uint256", name: "minOutput", type: "uint256" },
      { internalType: "bytes32[]", name: "orderHashes", type: "bytes32[]" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "fillOrdersThenSwap",
    outputs: [{ internalType: "uint256", name: "totalOutput", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "bool", name: "isBuy", type: "bool" },
      { internalType: "uint256", name: "limit", type: "uint256" },
    ],
    name: "getActiveOrders",
    outputs: [
      { internalType: "bytes32[]", name: "orderHashes", type: "bytes32[]" },
      {
        components: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "uint56", name: "deadline", type: "uint56" },
          { internalType: "bool", name: "isYes", type: "bool" },
          { internalType: "bool", name: "isBuy", type: "bool" },
          { internalType: "bool", name: "partialFill", type: "bool" },
          { internalType: "uint96", name: "shares", type: "uint96" },
          { internalType: "uint96", name: "collateral", type: "uint96" },
          { internalType: "uint256", name: "marketId", type: "uint256" },
        ],
        internalType: "struct PMRouter.Order[]",
        name: "orderDetails",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "getMarketOrderCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "offset", type: "uint256" },
      { internalType: "uint256", name: "limit", type: "uint256" },
    ],
    name: "getMarketOrderHashes",
    outputs: [{ internalType: "bytes32[]", name: "orderHashes", type: "bytes32[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "orderHash", type: "bytes32" }],
    name: "getOrder",
    outputs: [
      {
        components: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "uint56", name: "deadline", type: "uint56" },
          { internalType: "bool", name: "isYes", type: "bool" },
          { internalType: "bool", name: "isBuy", type: "bool" },
          { internalType: "bool", name: "partialFill", type: "bool" },
          { internalType: "uint96", name: "shares", type: "uint96" },
          { internalType: "uint96", name: "collateral", type: "uint96" },
          { internalType: "uint256", name: "marketId", type: "uint256" },
        ],
        internalType: "struct PMRouter.Order",
        name: "order",
        type: "tuple",
      },
      { internalType: "uint96", name: "sharesFilled", type: "uint96" },
      { internalType: "uint96", name: "sharesRemaining", type: "uint96" },
      { internalType: "uint96", name: "collateralFilled", type: "uint96" },
      { internalType: "uint96", name: "collateralRemaining", type: "uint96" },
      { internalType: "bool", name: "active", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "uint256", name: "depth", type: "uint256" },
    ],
    name: "getOrderbook",
    outputs: [
      { internalType: "bytes32[]", name: "bidHashes", type: "bytes32[]" },
      {
        components: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "uint56", name: "deadline", type: "uint56" },
          { internalType: "bool", name: "isYes", type: "bool" },
          { internalType: "bool", name: "isBuy", type: "bool" },
          { internalType: "bool", name: "partialFill", type: "bool" },
          { internalType: "uint96", name: "shares", type: "uint96" },
          { internalType: "uint96", name: "collateral", type: "uint96" },
          { internalType: "uint256", name: "marketId", type: "uint256" },
        ],
        internalType: "struct PMRouter.Order[]",
        name: "bidOrders",
        type: "tuple[]",
      },
      { internalType: "bytes32[]", name: "askHashes", type: "bytes32[]" },
      {
        components: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "uint56", name: "deadline", type: "uint56" },
          { internalType: "bool", name: "isYes", type: "bool" },
          { internalType: "bool", name: "isBuy", type: "bool" },
          { internalType: "bool", name: "partialFill", type: "bool" },
          { internalType: "uint96", name: "shares", type: "uint96" },
          { internalType: "uint96", name: "collateral", type: "uint96" },
          { internalType: "uint256", name: "marketId", type: "uint256" },
        ],
        internalType: "struct PMRouter.Order[]",
        name: "askOrders",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getUserOrderCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "uint256", name: "offset", type: "uint256" },
      { internalType: "uint256", name: "limit", type: "uint256" },
    ],
    name: "getUserOrderHashes",
    outputs: [{ internalType: "bytes32[]", name: "orderHashes", type: "bytes32[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "orderHash", type: "bytes32" }],
    name: "isOrderActive",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "merge",
    outputs: [],
    stateMutability: "nonpayable",
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
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "orders",
    outputs: [
      { internalType: "address", name: "owner", type: "address" },
      { internalType: "uint56", name: "deadline", type: "uint56" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "bool", name: "isBuy", type: "bool" },
      { internalType: "bool", name: "partialFill", type: "bool" },
      { internalType: "uint96", name: "shares", type: "uint96" },
      { internalType: "uint96", name: "collateral", type: "uint96" },
      { internalType: "uint256", name: "marketId", type: "uint256" },
    ],
    stateMutability: "view",
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
      { internalType: "address", name: "holder", type: "address" },
      { internalType: "uint256", name: "nonce", type: "uint256" },
      { internalType: "uint256", name: "expiry", type: "uint256" },
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
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "bool", name: "isBuy", type: "bool" },
      { internalType: "uint96", name: "shares", type: "uint96" },
      { internalType: "uint96", name: "collateral", type: "uint96" },
      { internalType: "uint56", name: "deadline", type: "uint56" },
      { internalType: "bool", name: "partialFill", type: "bool" },
    ],
    name: "placeOrder",
    outputs: [{ internalType: "bytes32", name: "orderHash", type: "bytes32" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "uint256", name: "sharesIn", type: "uint256" },
      { internalType: "uint256", name: "minCollateralOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "sell",
    outputs: [{ internalType: "uint256", name: "collateralOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
    ],
    name: "split",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "uint256", name: "collateralIn", type: "uint256" },
      { internalType: "uint256", name: "minSharesOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapCollateralToShares",
    outputs: [{ internalType: "uint256", name: "sharesOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "yesForNo", type: "bool" },
      { internalType: "uint256", name: "amountIn", type: "uint256" },
      { internalType: "uint256", name: "minOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapShares",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "bool", name: "isYes", type: "bool" },
      { internalType: "uint256", name: "sharesIn", type: "uint256" },
      { internalType: "uint256", name: "minCollateralOut", type: "uint256" },
      { internalType: "uint256", name: "feeOrHook", type: "uint256" },
      { internalType: "address", name: "to", type: "address" },
      { internalType: "uint256", name: "deadline", type: "uint256" },
    ],
    name: "swapSharesToCollateral",
    outputs: [{ internalType: "uint256", name: "collateralOut", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  { stateMutability: "payable", type: "receive" },
] as const;

// Order type
export interface PMRouterOrder {
  owner: string;
  deadline: bigint;
  isYes: boolean;
  isBuy: boolean;
  partialFill: boolean;
  shares: bigint;
  collateral: bigint;
  marketId: bigint;
}

/**
 * Calculate price per share from order
 */
export function getOrderPrice(order: PMRouterOrder): number {
  if (order.shares === 0n) return 0;
  return Number(order.collateral) / Number(order.shares);
}

/**
 * Check if this is a bid (buy order) or ask (sell order)
 */
export function isBidOrder(order: PMRouterOrder): boolean {
  return order.isBuy;
}
