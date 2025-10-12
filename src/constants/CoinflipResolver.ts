export const COINFLIP_RESOLVER_ADDRESS = "0x07e53dd08D9579e90928636068835d4EADc253a6" as const;

export const CoinflipResolverAbi = [
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
    name: "tipPerResolve",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "currentInfo",
    outputs: [
      { name: "marketId", type: "uint256" },
      { name: "closeAt", type: "uint72" },
      { name: "targetBlock", type: "uint64" },
      { name: "isResolved", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "marketId", type: "uint256" }],
    name: "epochs",
    outputs: [
      { name: "closeAt", type: "uint72" },
      { name: "targetBlock", type: "uint64" },
      { name: "seed", type: "uint256" },
      { name: "resolved", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "canResolveNow",
    outputs: [
      { name: "ready", type: "bool" },
      { name: "shouldSkip", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
