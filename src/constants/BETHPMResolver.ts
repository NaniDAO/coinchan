export const BETH_PM_RESOLVER_ADDRESS = "0x9E52F272bACf991FC842704593c86820Ab3e0dB8" as const;
export const BETH_ADDRESS = "0x2cb662Ec360C34a45d7cA0126BCd53C9a1fd48F9" as const;

export const BETHPMResolverAbi = [
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
    name: "totalBurned",
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
