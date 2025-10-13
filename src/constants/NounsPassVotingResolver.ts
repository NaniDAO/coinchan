export const NOUNS_PASS_VOTING_RESOLVER_ADDRESS = "0x1637047F090D6b38D81DA0C589D4D8B9D3C7F32e" as const;

export const NounsPassVotingResolverAbi = [
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "poke",
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
    name: "tipPerAction",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "canResolveNow",
    outputs: [
      { name: "ready", type: "bool" },
      { name: "deadMarket", type: "bool" },
      { name: "yesWins", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "marketOf",
    outputs: [
      { name: "marketId", type: "uint256" },
      { name: "evalBlock", type: "uint64" },
      { name: "closeAt", type: "uint72" },
      { name: "created", type: "bool" },
      { name: "settled", type: "bool" },
      { name: "deadLogged", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "proposalId", type: "uint256" }],
    name: "marketIdFor",
    outputs: [
      { name: "id", type: "uint256" },
      { name: "created", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
