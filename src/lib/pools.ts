import { ProtocolId } from "@/components/pools/ProtocolSelector";
import {
  Address,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  zeroAddress,
} from "viem";
import { SWAP_FEE } from "./swap";

export const FEE_OPTIONS = [
  { label: "0.05%", value: 5n, description: "Ultra low fee" }, // Ultra low fee
  { label: "0.3%", value: 30n, description: "Default (Uniswap V2 style)" }, // Default (Uniswap V2 style)
  { label: "1%", value: 100n, description: "Standard" }, // Current cookbook standard
  { label: "3%", value: 300n, description: "High fee for exotic pairs" }, // High fee for exotic pairs
];

export const DEFAULT_FEE_TIER = 100n;

export const ETH_TOKEN: TokenMetadata = {
  address: zeroAddress,
  decimals: 18,
  description:
    "Ethereum is a decentralized platform that enables smart contracts and decentralized applications.",
  id: 0n,
  imageUrl:
    "https://assets.coingecko.com/coins/images/279/standard/ethereum.png?1727872989",
  name: "Ethereum",
  standard: "ERC6909",
  symbol: "ETH",
  tags: ["ethereum", "crypto", "blockchain"],
};

export const ZAMM_TOKEN: TokenMetadata = {
  address: "0x0000000000009710cd229bF635c4500029651eE8",
  decimals: 18,
  description:
    "ZAMM is a DeFi singularity system that aims to unite liquidity and provide hyperoptimization to passive LP.\n\nMaking the Ethereum mainnet/L1 cheap and simple!\n\nSinglepager:",
  id: 1334160193485309697971829933264346612480800613613n,
  imageUrl: "ipfs://QmbdDi7Xo42LUtcP1seMTQpsRS6cWos6v6pqW8FgUTCizy",
  name: "ZAMM",
  standard: "ERC6909",
  symbol: "ZAMM",
  tags: ["zamm", "crypto", "token"],
};

export type TokenStandard = "ERC20" | "ERC6909";

export type Token = {
  address: Address;
  id: bigint;
};

export type TokenMetadata = Token & {
  name: string;
  symbol: string;
  imageUrl: string;
  decimals: number;
  standard: TokenStandard;
  description?: string;
  tags?: string[];
  balance?: bigint;
};

export const computePoolId = (
  tokenA: Token,
  tokenB: Token,
  feeOrHook: bigint = SWAP_FEE,
  protocol: ProtocolId,
) => {
  if (protocol === "ZAMMV1") {
    return BigInt(
      keccak256(
        encodeAbiParameters(
          parseAbiParameters(
            "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
          ),
          [tokenA.id, tokenB.id, tokenA.address, tokenB.address, feeOrHook],
        ),
      ),
    );
  }

  return BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 id0, uint256 id1, address token0, address token1, uint256 feeOrHook",
        ),
        [tokenA.id, tokenB.id, tokenA.address, tokenB.address, feeOrHook],
      ),
    ),
  );
};
