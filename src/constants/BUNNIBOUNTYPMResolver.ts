export const BUNNIBOUNTYPM_RESOLVER_ADDRESS = "0xD3eAE176700b4b25C0f14978Ee8B311784cce21C" as const;
export const HOLD_ADDRESS = "0xCD7f4Deff216700d36CB9824a6d897164D3E98a6" as const;

export const BUNNIBOUNTYPMResolverAbi = [
  {
    inputs: [{ name: "marketId", type: "uint256" }],
    name: "bets",
    outputs: [
      { name: "amount", type: "uint184" },
      { name: "deadline", type: "uint72" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "bountyBalance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "marketId", type: "uint256" }],
    name: "resolveBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
