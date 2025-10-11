export const ETH_WENT_UP_RESOLVER_ADDRESS = "0x40cc6F9ca737a0aA746b645cFc92a67942162CC3" as const;

export const EthWentUpResolverAbi = [
  {
    inputs: [],
    name: "resolve",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "fundTips",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "tipResolve",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "currentTimes",
    outputs: [
      { name: "marketId", type: "uint256" },
      { name: "closeAt", type: "uint72" },
      { name: "resolveAt", type: "uint72" },
      { name: "isResolved", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "tipPerResolve",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "marketId", type: "uint256" }],
    name: "epochs",
    outputs: [
      { name: "closeAt", type: "uint72" },
      { name: "resolveAt", type: "uint72" },
      { name: "startDecimals", type: "uint8" },
      { name: "startRoundId", type: "uint80" },
      { name: "startPrice", type: "uint256" },
      { name: "startUpdatedAt", type: "uint256" },
      { name: "exists", type: "bool" },
      { name: "resolved", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
