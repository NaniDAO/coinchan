import { ProtocolId } from "@/lib/protocol";
import {
  Address,
  encodeAbiParameters,
  encodeFunctionData,
  keccak256,
  parseAbiParameters,
  PublicClient,
  zeroAddress,
} from "viem";
import { PoolKey, SWAP_FEE, withSlippage } from "./swap";
import { getProtocol } from "./protocol";
import { getApprovalOrOperator } from "./txs";

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

// Popcount for a 160-bit EVM address (Hamming weight)
const hammingWeightOfAddress = (addr: Address): number => {
  let x = BigInt(addr); // 0x.. -> bigint
  let c = 0;
  while (x !== 0n) {
    // classic popcount
    x &= x - 1n;
    c++;
  }
  return c;
};

// Deterministic token ordering:
// 1) lower Hamming weight(address) first
// 2) if addresses differ but have equal weight -> lower numeric address first (tie-breaker)
// 3) if same address (same 6909 contract) -> lower id first
const compareTokens = (a: Token, b: Token): number => {
  const wa = hammingWeightOfAddress(a.address);
  const wb = hammingWeightOfAddress(b.address);
  if (wa !== wb) return wa - wb;

  const aAddr = BigInt(a.address);
  const bAddr = BigInt(b.address);

  if (aAddr !== bAddr) return aAddr < bAddr ? -1 : 1;

  // same contract (ERC-6909): compare ids
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;

  return 0; // identical token (address+id)
};

export const orderTokens = (tA: Token, tB: Token): [Token, Token] => {
  return compareTokens(tA, tB) <= 0 ? [tA, tB] : [tB, tA];
};

export const computePoolId = (
  tokenA: Token,
  tokenB: Token,
  feeOrHook: bigint = SWAP_FEE,
  protocol: ProtocolId,
): bigint => {
  // disallow identical token on both sides
  if (
    tokenA.address.toLowerCase() === tokenB.address.toLowerCase() &&
    tokenA.id === tokenB.id
  ) {
    return 0n;
  }

  const [token0, token1] = orderTokens(tokenA, tokenB);

  if (protocol === "ZAMMV1") {
    return BigInt(
      keccak256(
        encodeAbiParameters(
          parseAbiParameters(
            "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
          ),
          [token0.id, token1.id, token0.address, token1.address, feeOrHook],
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
        [token0.id, token1.id, token0.address, token1.address, feeOrHook],
      ),
    ),
  );
};

/**
 * Compute pool key structure for a coin ID
 * @returns PoolKey structure
 */
export const computePoolKey = (
  token0: Token,
  token1: Token,
  feeOrHook: bigint = SWAP_FEE,
  protocolId: ProtocolId,
): PoolKey => {
  if (protocolId === "ZAMMV1") {
    return {
      id0: token0.id,
      id1: token1.id,
      token0: token0.address,
      token1: token1.address,
      feeOrHook: feeOrHook,
    };
  }

  return {
    id0: token0.id,
    id1: token1.id,
    token0: token0.address,
    token1: token1.address,
    swapFee: feeOrHook,
  };
};

type AddLiquidityArgs = {
  owner: Address;
  token0: Token;
  token1: Token;
  amount0: bigint;
  amount1: bigint;
  deadline: bigint;
  feeBps: bigint;
  slippageBps: bigint;
  protocolId: ProtocolId;
};

export const getAddLiquidityTx = async (
  publicClient: PublicClient,
  {
    owner,
    token0,
    token1,
    amount0,
    amount1,
    deadline,
    feeBps,
    slippageBps,
    protocolId,
  }: AddLiquidityArgs,
) => {
  const protocol = getProtocol(protocolId);

  if (!protocol) {
    throw new Error(`Protocol ${protocolId} not found`);
  }

  const [approval0, approval1] = await Promise.all([
    getApprovalOrOperator(publicClient, {
      token: token0,
      owner,
      spender: protocol.address,
      required: amount0,
    }),
    getApprovalOrOperator(publicClient, {
      token: token1,
      owner,
      spender: protocol.address,
      required: amount1,
    }),
  ]);

  const poolKey = computePoolKey(token0, token1, feeBps, protocolId);
  const amount0Min = withSlippage(amount0, slippageBps);
  const amount1Min = withSlippage(amount1, slippageBps);

  const isETH = token0.address === zeroAddress && token0.id === 0n;

  const callData = encodeFunctionData({
    abi: protocol.abi,
    functionName: "addLiquidity",
    // @ts-expect-error
    args: [poolKey, amount0, amount1, amount0Min, amount1Min, owner, deadline],
  });

  return {
    approvals: [approval0, approval1].filter((approval) => approval !== null),
    tx: {
      to: protocol.address,
      value: isETH ? amount0 : 0n,
      data: callData,
    },
  };
};

export const bpsToPct = (bps?: string | number | null) => {
  const n = Number(bps ?? 0);
  if (!Number.isFinite(n)) return "—";
  // bps → percent (e.g. 30 → 0.30%, 3000 → 30.00%)
  return (
    (n / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + "%"
  );
};
