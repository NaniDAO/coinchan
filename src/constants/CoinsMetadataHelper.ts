import { Address } from "viem";

export const CoinsMetadataHelperAddress =
  "0x10471CA11076f446F9f77DbA164fe810902d0Fd4" as Address;

export const CoinsMetadataHelperAbi = [
  {
    inputs: [],
    name: "getAllCoinsData",
    outputs: [
      {
        components: [
          { name: "coinId", type: "uint256" },
          { name: "tokenURI", type: "string" },
          { name: "reserve0", type: "uint112" },
          { name: "reserve1", type: "uint112" },
          { name: "poolId", type: "uint256" },
          { name: "liquidity", type: "uint256" },
        ],
        internalType: "struct CoinsMetadataHelper.CoinData[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "coinId", type: "uint256" }],
    name: "getCoinData",
    outputs: [
      {
        components: [
          { name: "coinId", type: "uint256" },
          { name: "tokenURI", type: "string" },
          { name: "reserve0", type: "uint112" },
          { name: "reserve1", type: "uint112" },
          { name: "poolId", type: "uint256" },
          { name: "liquidity", type: "uint256" },
        ],
        internalType: "struct CoinsMetadataHelper.CoinData[]",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "coinIds", type: "uint256[]" }],
    name: "getCoinsByIds",
    outputs: [
      {
        components: [
          { name: "coinId", type: "uint256" },
          { name: "tokenURI", type: "string" },
          { name: "reserve0", type: "uint112" },
          { name: "reserve1", type: "uint112" },
          { name: "poolId", type: "uint256" },
          { name: "liquidity", type: "uint256" },
        ],
        internalType: "struct CoinsMetadataHelper.CoinData[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "start", type: "uint256" },
      { name: "finish", type: "uint256" },
    ],
    name: "getCoinDataBatch",
    outputs: [
      {
        components: [
          { name: "coinId", type: "uint256" },
          { name: "tokenURI", type: "string" },
          { name: "reserve0", type: "uint112" },
          { name: "reserve1", type: "uint112" },
          { name: "poolId", type: "uint256" },
          { name: "liquidity", type: "uint256" },
        ],
        internalType: "struct CoinsMetadataHelper.CoinData[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "count", type: "uint256" }],
    name: "getLatestCoins",
    outputs: [
      {
        components: [
          { name: "coinId", type: "uint256" },
          { name: "tokenURI", type: "string" },
          { name: "reserve0", type: "uint112" },
          { name: "reserve1", type: "uint112" },
          { name: "poolId", type: "uint256" },
          { name: "liquidity", type: "uint256" },
        ],
        internalType: "struct CoinsMetadataHelper.CoinData[]",
        name: "",
        type: "tuple[]",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getCoinsCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "coinId", type: "uint256" }],
    name: "computePoolId",
    outputs: [{ name: "poolId", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
