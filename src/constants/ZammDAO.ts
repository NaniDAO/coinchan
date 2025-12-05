// ZAMM DAO Contract Addresses and Constants
import { ZORG_ADDRESS, ZORG_ABI, ZORG_SHARES, ZORG_SHARES_ABI } from "./ZORG";

export const ZAMM_DAO_ADDRESS = ZORG_ADDRESS;
export const ZAMM_DAO_ABI = ZORG_ABI;

// Shares and Loot tokens (from DAO contract)
export const ZAMM_SHARES_ADDRESS = ZORG_SHARES;
export const ZAMM_SHARES_ABI = ZORG_SHARES_ABI;

// Treasury Asset Addresses (Ethereum Mainnet)
export const TREASURY_ASSETS = {
  ETH: {
    address: "0x0000000000000000000000000000000000000000",
    symbol: "ETH",
    decimals: 18,
    name: "Ethereum",
  },
  USDC: {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    decimals: 6,
    name: "USD Coin",
  },
  USDT: {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    decimals: 6,
    name: "Tether USD",
  },
  DAI: {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    decimals: 18,
    name: "Dai Stablecoin",
  },
  WSTETH: {
    address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    symbol: "wstETH",
    decimals: 18,
    name: "Wrapped Staked ETH",
  },
  RETH: {
    address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    symbol: "rETH",
    decimals: 18,
    name: "Rocket Pool ETH",
  },
} as const;

// ERC20 ABI for token interactions
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

// Loot Token ABI (similar to Shares but separate)
export const LOOT_ABI = ZAMM_SHARES_ABI; // Same interface

// Badges Token ABI (ERC6909)
export const BADGES_ABI = [
  "function tokenURI(uint256 id) view returns (string)",
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function contractURI() view returns (string)",
] as const;

// Proposal States
export enum ProposalState {
  Pending = 0,
  Active = 1,
  Defeated = 2,
  Succeeded = 3,
  Queued = 4,
  Executed = 5,
  Cancelled = 6,
  Expired = 7,
}

// Vote Support
export enum VoteSupport {
  Against = 0,
  For = 1,
  Abstain = 2,
}

// Op codes for proposals
export enum ProposalOp {
  Call = 0,
  DelegateCall = 1,
  Create = 2,
}

// Governance Constants
export const GOVERNANCE = {
  BASIS_POINTS: 10000, // 100% = 10000 bps
  MIN_CHAT_FEE: "0.001", // ETH
  DEFAULT_PROPOSAL_TTL: 7 * 24 * 60 * 60, // 7 days in seconds
  DEFAULT_TIMELOCK_DELAY: 2 * 24 * 60 * 60, // 2 days in seconds
} as const;

// Helper function to format proposal ID
export function formatProposalId(id: bigint | number): string {
  const idStr = id.toString();
  if (idStr.length <= 8) return idStr;
  return `${idStr.slice(0, 4)}...${idStr.slice(-4)}`;
}

// Helper function to format addresses
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Helper to check if an address is a DAO contract
export function isDaoContract(address: string): boolean {
  return address.toLowerCase() === ZAMM_DAO_ADDRESS.toLowerCase();
}

// Helper to get asset info
export function getAssetInfo(address: string) {
  const addr = address.toLowerCase();
  for (const asset of Object.values(TREASURY_ASSETS)) {
    if (asset.address.toLowerCase() === addr || addr === "0x0000000000000000000000000000000000000000") {
      return asset;
    }
  }
  return null;
}
