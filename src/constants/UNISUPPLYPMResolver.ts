export const UNISUPPLY_PM_RESOLVER_ADDRESS = "0x3F51b9F555907C2f968a2b24f7529Bac0a12d326" as const;
export const UNI_ADDRESS = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as const;

export const UNISUPPLYPMResolverAbi = [
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
    name: "totalSupply",
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
