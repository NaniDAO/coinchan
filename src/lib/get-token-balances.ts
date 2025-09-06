import {
  erc20Abi,
  isAddressEqual,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import type { Token, TokenMetadata } from "@/lib/pools";

type WithId = Token | TokenMetadata;

const keyOf = (t: WithId) =>
  `${(t.address as Address).toLowerCase()}:${t.id.toString()}`;

const chunk = <T>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Batch fetch balances for many tokens in the most efficient way available.
 * - ERC20 -> balanceOf(owner)
 * - ERC6909 (Coins/Cookbook) -> balanceOf(owner, id)
 * - ETH (zero address + id 0n) -> getBalance(owner)
 */
export async function getTokenBalances(opts: {
  publicClient: PublicClient;
  owner: Address;
  tokens: readonly WithId[];
}): Promise<Map<string, bigint>> {
  const { publicClient, owner, tokens } = opts;

  const results = new Map<string, bigint>();

  let hasEth = false;
  const erc20Calls: {
    token: WithId;
    contract: Parameters<typeof publicClient.multicall>[0]["contracts"][number];
  }[] = [];
  const coinsCalls: typeof erc20Calls = [];
  const cookbookCalls: typeof erc20Calls = [];

  for (const t of tokens) {
    if (t.address === zeroAddress && t.id === 0n) {
      hasEth = true;
      continue;
    }
    const asAddr = t.address as Address;

    if (isAddressEqual(asAddr, CoinsAddress)) {
      coinsCalls.push({
        token: t,
        contract: {
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "balanceOf",
          args: [owner, t.id] as const,
        },
      });
    } else if (isAddressEqual(asAddr, CookbookAddress)) {
      cookbookCalls.push({
        token: t,
        contract: {
          address: CookbookAddress,
          abi: CookbookAbi,
          functionName: "balanceOf",
          args: [owner, t.id] as const,
        },
      });
    } else {
      // default to ERC20
      erc20Calls.push({
        token: t,
        contract: {
          address: asAddr,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner] as const,
        },
      });
    }
  }

  // process a group of calls safely (chunk to avoid huge payloads)
  const runGroup = async (group: typeof erc20Calls): Promise<void> => {
    if (!group.length) return;
    for (const batch of chunk(group, 500)) {
      const resp = await publicClient.multicall({
        allowFailure: true,
        // @ts-ignore
        contracts: batch.map((x) => x.contract),
      });
      resp.forEach((r, i) => {
        const tok = batch[i].token;
        results.set(
          keyOf(tok),
          r.status === "success" ? (r.result as bigint) : 0n,
        );
      });
    }
  };

  await Promise.all([
    runGroup(erc20Calls),
    runGroup(coinsCalls),
    runGroup(cookbookCalls),
  ]);

  if (hasEth) {
    const balance = await publicClient.getBalance({ address: owner });
    // find the ETH token(s) (usually just one)
    for (const t of tokens) {
      if (t.address === zeroAddress && t.id === 0n) {
        results.set(keyOf(t), balance);
      }
    }
  }

  return results;
}
