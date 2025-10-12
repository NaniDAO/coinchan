export const COINFLIP_RESOLVER_ADDRESS = "0xeAd4D6A7C5C0D8ff7bFbe3ab1b4b4bc596C1FD1c" as const;

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
