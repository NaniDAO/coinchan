import { encodeAbiParameters, encodeFunctionData, type Address } from "viem";
import type { EfficiencySide } from "@/hooks/use-zrouter-vs-uni-efficiency";

/** Mainnet Universal Router (v2) */
export const UNIVERSAL_ROUTER_MAINNET: Address = "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B";

/** Minimal UR ABI – we use the deadline variant for convenience */
export const universalRouterAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export type BuildUniRouterCallArgs = {
  /** EXACT_IN or EXACT_OUT */
  side: EfficiencySide;
  /** amountIn for EXACT_IN, amountOut for EXACT_OUT */
  amount: bigint;
  /** Uniswap v3 encoded path (packed addresses + fees). For EXACT_OUT this should be reversed (out -> in) */
  path: `0x${string}`;
  /** Final recipient of swap proceeds */
  recipient: Address;

  /** Optional overrides */
  universalRouter?: Address; // defaults to mainnet UR
  payerIsUser?: boolean; // defaults to true (UR pulls from msg.sender via Permit2)
  allowRevert?: boolean; // defaults to false (no partial fill flag)
  amountLimit?: bigint; // amountOutMin (EXACT_IN) or amountInMax (EXACT_OUT); defaults to 0 / huge
  deadlineSeconds?: number; // seconds from "now"; defaults to 300
};

export type BuildUniRouterCallResult = {
  to: Address;
  data: `0x${string}`;
  value: bigint; // ETH value to send (we keep 0 when using WETH in path)
};

export type BuildUniRouterCallFn = (args: BuildUniRouterCallArgs) => Promise<BuildUniRouterCallResult>;

/**
 * Build Universal Router calldata for a single v3 swap.
 * Uses commands:
 *   0x00 = V3_SWAP_EXACT_IN (inputs: recipient, amountIn, amountOutMin, path, payerIsUser)
 *   0x01 = V3_SWAP_EXACT_OUT (inputs: recipient, amountOut, amountInMax, path, payerIsUser)
 *
 * Notes:
 * - For estimation we set amountOutMin=0 (EXACT_IN) or amountInMax=~(0) (EXACT_OUT) unless provided.
 * - We set `payerIsUser=true` by default; if there’s no allowance/balance, gas estimation may revert —
 *   your hook already falls back to Quoter gas in that case.
 * - If your “input token” is native ETH, your path should start with WETH and you should have wrapped ETH
 *   or include WRAP_ETH as a preceding command; for pure gas estimation we keep `value=0n`.
 */
export const buildUniRouterCall: BuildUniRouterCallFn = async ({
  side,
  amount,
  path,
  recipient,
  universalRouter = UNIVERSAL_ROUTER_MAINNET,
  payerIsUser = true,
  allowRevert = false,
  amountLimit,
  deadlineSeconds = 300,
}) => {
  // Compose the single command byte
  // High bit (0x80) toggles ALLOW_REVERT; low 5 bits are the command id.
  const CMD_V3_SWAP_EXACT_IN = 0x00;
  const CMD_V3_SWAP_EXACT_OUT = 0x01;
  const baseCmd = side === "EXACT_IN" ? CMD_V3_SWAP_EXACT_IN : CMD_V3_SWAP_EXACT_OUT;
  const cmdByte = (allowRevert ? 0x80 : 0x00) | baseCmd;
  const commands = `0x${cmdByte.toString(16).padStart(2, "0")}` as `0x${string}`;

  // Choose the min/max guard depending on side
  const MAX_IN_SENTINEL: bigint = (1n << 255n) - 1n; // large cap like SR02’s pattern
  const outMinOrInMax = amountLimit ?? (side === "EXACT_IN" ? 0n : MAX_IN_SENTINEL);

  // Encode the single inputs[i] for our command
  // Per docs (UR v2): (address recipient, uint256 amount*, uint256 limit*, bytes path, bool payerIsUser)
  const input = encodeAbiParameters(
    [
      { type: "address" }, // recipient
      { type: "uint256" }, // amountIn / amountOut
      { type: "uint256" }, // amountOutMin / amountInMax
      { type: "bytes" }, // path (packed v3 path)
      { type: "bool" }, // payerIsUser
    ],
    [recipient, amount, outMinOrInMax, path, payerIsUser],
  );

  // A short horizon deadline is fine for estimation
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);

  const data = encodeFunctionData({
    abi: universalRouterAbi,
    functionName: "execute",
    args: [commands, [input], deadline],
  });

  // For WETH paths we keep value=0 (no native ETH sent)
  return { to: universalRouter, data, value: 0n };
};
