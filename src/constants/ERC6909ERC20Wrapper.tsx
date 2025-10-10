export const ERC6909ERC20WrapperAbi = [
  { inputs: [], stateMutability: "payable", type: "constructor" },
  { inputs: [], name: "Reentrancy", type: "error" },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "contract IERC6909",
        name: "erc6909",
        type: "address",
      },
      { indexed: true, internalType: "uint256", name: "id", type: "uint256" },
      {
        indexed: false,
        internalType: "address",
        name: "erc20",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "Unwrapped",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "contract IERC6909",
        name: "erc6909",
        type: "address",
      },
      { indexed: true, internalType: "uint256", name: "id", type: "uint256" },
      {
        indexed: false,
        internalType: "address",
        name: "erc20",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "Wrapped",
    type: "event",
  },
  {
    inputs: [
      { internalType: "contract IERC6909", name: "erc6909", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "unwrap",
    outputs: [{ internalType: "address", name: "erc20", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "contract IERC6909", name: "erc6909", type: "address" },
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "wrap",
    outputs: [{ internalType: "address", name: "erc20", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;
export const ERC6909ERC20WrapperAddress = "0x000000000020979cc92752fa2708868984a7f746";
