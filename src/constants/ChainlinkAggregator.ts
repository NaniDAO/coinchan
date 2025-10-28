export const CHAINLINK_ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as const;

// Chainlink price feeds for ERC20 tokens (TOKEN/ETH pairs)
// Keys are lowercase for case-insensitive lookup
export const CHAINLINK_PRICE_FEEDS: Record<string, `0x${string}`> = {
  // DAI/ETH - https://data.chain.link/ethereum/mainnet/crypto-eth/dai-eth
  "0x6b175474e89094c44da98b954eedeac495271d0f": "0x773616E4d11A78F511299002da57A0a94577F1f4",
  // USDC/ETH - https://data.chain.link/ethereum/mainnet/crypto-eth/usdc-eth
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "0x986b5E1e1755e3C2440e960477f25201B0a8bbD4",
  // USDT/ETH - https://data.chain.link/ethereum/mainnet/crypto-eth/usdt-eth
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "0xEe9F2375b4bdF6387aa8265dD4FB8F16512A1d46",
  // WBTC/ETH - https://data.chain.link/ethereum/mainnet/crypto-eth/wbtc-eth
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "0xdeb288F737066589598e9214E782fa5A8eD689e8",
  // LINK/ETH - https://data.chain.link/ethereum/mainnet/crypto-eth/link-eth
  "0x514910771af9ca656af840dff83e8264ecf986ca": "0xDC530D9457755926550b59e8ECcdaE7624181557",
  // UNI/ETH - https://data.chain.link/ethereum/mainnet/crypto-eth/uni-eth
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "0xD6aA3D25116d8dA79Ea0246c4826EB951872e02e",
};

export const ChainlinkAggregatorV3Abi = [
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
] as const;
