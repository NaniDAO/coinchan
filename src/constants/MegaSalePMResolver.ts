export const MegaSalePMResolverAddress = "0x14B782586a218C2F9F84b815308cc25fE0A7642F";

export const MegaSalePMResolverAbi = [
  {
    inputs: [],
    name: "Pending",
    type: "error",
  },
  {
    inputs: [],
    name: "Unknown",
    type: "error",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "bets",
    outputs: [
      { internalType: "uint64", name: "amount", type: "uint64" },
      { internalType: "uint72", name: "deadline", type: "uint72" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "closeAuctionAtTimestamp",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint64", name: "amount", type: "uint64" },
      { internalType: "uint72", name: "deadline", type: "uint72" },
      { internalType: "uint256", name: "seedYes", type: "uint256" },
      { internalType: "uint256", name: "seedNo", type: "uint256" },
    ],
    name: "makeBet",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint64", name: "amount", type: "uint64" },
      { internalType: "uint256", name: "seedYes", type: "uint256" },
      { internalType: "uint256", name: "seedNo", type: "uint256" },
    ],
    name: "makeBetOnDeadline",
    outputs: [
      { internalType: "uint256", name: "marketId", type: "uint256" },
      { internalType: "uint256", name: "noId", type: "uint256" },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "marketId", type: "uint256" }],
    name: "resolveBet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "totalActiveBidAmount",
    outputs: [{ internalType: "uint64", name: "", type: "uint64" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
