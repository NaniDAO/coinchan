export const UNIV4_FEE_SWITCH_PM_RESOLVER_ADDRESS = "0xF92007bFaF3B3738922c33f2F44Cd445a684257E" as const;
export const UNIV4_ADDRESS = "0x000000000004444c5dc75cB358380D2e3dE08A90" as const;

export const UniV4FeeSwitchPMResolverAbi = [
  {
    inputs: [{ name: "marketId", type: "uint256" }],
    name: "deadline",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "protocolFeeController",
    outputs: [{ name: "", type: "address" }],
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
  {
    inputs: [
      { name: "_deadline", type: "uint256" },
      { name: "seedYes", type: "uint256" },
      { name: "seedNo", type: "uint256" },
    ],
    name: "makeBet",
    outputs: [
      { name: "marketId", type: "uint256" },
      { name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
