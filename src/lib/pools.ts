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
import { CookbookAddress } from "@/constants/Cookbook";

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
  description: "Ethereum is a decentralized platform that enables smart contracts and decentralized applications.",
  id: 0n,
  imageUrl: "https://assets.coingecko.com/coins/images/279/standard/ethereum.png?1727872989",
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

export const ZAMM_ERC20_TOKEN = "0xe9b1cfea55baa219e34301f2f31b9fd0921664ed";

// veZAMM token - Special ERC6909 cookbook coin for farm rewards
export const VEZAMM_TOKEN: TokenMetadata = {
  address: CookbookAddress,
  id: 87n, // ERC6909 cookbook coin ID 87
  name: "veZAMM",
  symbol: "veZAMM",
  standard: "ERC6909",
  imageUrl: "/veZAMM.png", // Using the veZAMM.png file
  balance: 0n, // Will be updated with actual balance
  decimals: 18, // Standard 18 decimals
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
  if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase() && tokenA.id === tokenB.id) {
    return 0n;
  }

  const [token0, token1] = orderTokens(tokenA, tokenB);

  if (protocol === "ZAMMV0") {
    return BigInt(
      keccak256(
        encodeAbiParameters(
          parseAbiParameters("uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee"),
          [token0.id, token1.id, token0.address, token1.address, feeOrHook],
        ),
      ),
    );
  }

  return BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters("uint256 id0, uint256 id1, address token0, address token1, uint256 feeOrHook"),
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

async function getPoolReserves(
  publicClient: PublicClient,
  {
    poolId,
    protocolId,
  }: {
    poolId: bigint;
    protocolId: ProtocolId;
  },
): Promise<{ reserve0: bigint; reserve1: bigint; supply: bigint }> {
  const protocol = getProtocol(protocolId);
  if (!protocol) throw new Error(`Protocol ${protocolId} not found`);
  const data = await publicClient.readContract({
    address: protocol.address,
    abi: protocol.abi,
    functionName: "pools",
    args: [poolId],
  });

  return {
    reserve0: data[0],
    reserve1: data[1],
    supply: data[6],
  };
}

// 2) calculateOptimalValue: exact mirror of the contract’s amount selection
async function calculateOptimalValue(
  publicClient: PublicClient,
  {
    token0,
    token1,
    amount0Desired,
    amount1Desired,
    feeBps,
    protocolId,
  }: {
    token0: Token;
    token1: Token;
    amount0Desired: bigint;
    amount1Desired: bigint;
    feeBps: bigint;
    protocolId: ProtocolId;
  },
): Promise<bigint> {
  // ETH must be token0 in v0 (canonical ordering enforces this on first mint)
  const isETH = token0.address === zeroAddress && token0.id === 0n;
  if (!isETH) return 0n;

  const protocol = getProtocol(protocolId);
  if (!protocol) return amount0Desired;

  // pool id & state
  const poolId = computePoolId(token0, token1, feeBps, protocolId);
  if (poolId === 0n) return 0n;

  const { reserve0, reserve1, supply } = await getPoolReserves(publicClient, {
    poolId: poolId,
    protocolId: protocolId,
  });

  // Contract logic:
  if (supply === 0n) {
    // first mint uses desired amounts
    return amount0Desired;
  }

  // guard against division by zero (shouldn't happen if supply>0, but be defensive)
  if (reserve0 === 0n || reserve1 === 0n) {
    return amount0Desired;
  }

  // amount1Optimal = amount0Desired * reserve1 / reserve0
  const amount1Optimal = (amount0Desired * reserve1) / reserve0;

  if (amount1Optimal <= amount1Desired) {
    // branch: take all amount0Desired
    return amount0Desired;
  } else {
    // amount0Optimal = amount1Desired * reserve0 / reserve1
    const amount0Optimal = (amount1Desired * reserve0) / reserve1;
    // this is the ETH value the contract will actually use
    return amount0Optimal;
  }
}

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
  { owner, token0, token1, amount0, amount1, deadline, feeBps, slippageBps, protocolId }: AddLiquidityArgs,
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

  let value = isETH ? amount0 : 0n;
  if (protocolId === "ZAMMV0") {
    value = await calculateOptimalValue(publicClient, {
      token0,
      token1,
      amount0Desired: amount0,
      amount1Desired: amount1,
      feeBps,
      protocolId,
    });
  }

  return {
    approvals: [approval0, approval1].filter((approval) => approval !== null),
    tx: {
      to: protocol.address,
      value: value,
      data: callData,
    },
  };
};

type RemoveLiquidityArgs = {
  owner: Address;

  // Same tokens you used when adding liquidity
  token0: Token;
  token1: Token;

  // Amount of LP tokens to burn (18 decimals, typically)
  liquidity: bigint;

  // Fee tier / hook encoded just like add-liquidity
  feeBps: bigint;

  // Deadline and slippage policy
  deadline: bigint;
  slippageBps: bigint;

  protocolId: ProtocolId;

  /**
   * One of the following strategies to set mins:
   *  - Provide explicit mins: minAmount0/minAmount1
   *  - Provide preview/expected amounts + slippageBps: expectedAmount0/expectedAmount1
   *  - Omit all -> default to 0n (no slippage protection)
   */
  minAmount0?: bigint;
  minAmount1?: bigint;
  expectedAmount0?: bigint;
  expectedAmount1?: bigint;
};

export const getRemoveLiquidityTx = async (
  _publicClient: PublicClient,
  {
    owner,
    token0,
    token1,
    liquidity,
    deadline,
    feeBps,
    slippageBps,
    protocolId,
    minAmount0,
    minAmount1,
    expectedAmount0,
    expectedAmount1,
  }: RemoveLiquidityArgs,
) => {
  const protocol = getProtocol(protocolId);
  if (!protocol) {
    throw new Error(`Protocol ${protocolId} not found`);
  }

  // Derive the poolKey (matches how add-liquidity does it)
  const poolKey: PoolKey = computePoolKey(token0, token1, feeBps, protocolId);

  // LP token is the pool itself (ERC-6909 style): address = protocol.address, id = poolId
  const poolId = computePoolId(token0, token1, feeBps, protocolId);
  if (poolId === 0n) {
    throw new Error("Invalid pool (identical tokens?)");
  }

  // Approve protocol to pull/burn the LP tokens on behalf of the owner
  const lpApproval = null;

  // Resolve min amounts (prefer explicit mins; else derive from preview; else 0n)
  const amount0Min = minAmount0 ?? (expectedAmount0 !== undefined ? withSlippage(expectedAmount0, slippageBps) : 0n);

  const amount1Min = minAmount1 ?? (expectedAmount1 !== undefined ? withSlippage(expectedAmount1, slippageBps) : 0n);

  const callData = encodeFunctionData({
    abi: protocol.abi,
    functionName: "removeLiquidity",
    // @ts-expect-error typed at runtime to either ZAMMV1 or other
    args: [poolKey, liquidity, amount0Min, amount1Min, owner, deadline],
  });

  return {
    approvals: [lpApproval].filter((a) => a !== null),
    tx: {
      to: protocol.address as Address,
      value: 0n, // no ETH needed for remove
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

export const sameToken = (x?: TokenMetadata | null, y?: TokenMetadata | null) =>
  !!x && !!y && x.id === y.id && String(x.address).toLowerCase() === String(y.address).toLowerCase();

// Any feeOrHook strictly greater than this is considered a hook
const HOOK_THRESHOLD = 10000n;

export const isFeeOrHook = (fee: bigint) => {
  try {
    return fee > HOOK_THRESHOLD;
  } catch {
    return false;
  }
};
