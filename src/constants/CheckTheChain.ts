export const CheckTheChainAddress = "0x0000000000cDC1F8d393415455E382c30FBc0a84";

// CheckTheChain contract ABI for fetching prices
export const CheckTheChainAbi = [
  {
    inputs: [{ internalType: "string", name: "symbol", type: "string" }],
    name: "checkPrice",
    outputs: [
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "string", name: "priceStr", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "string", name: "token", type: "string" }],
    name: "checkPriceInETH",
    outputs: [
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "string", name: "priceStr", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
