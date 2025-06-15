import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import type { Address, Hex, PublicClient } from "viem";
import { USDT_ADDRESS, type TokenMeta } from "@/lib/coins";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import {
  computePoolKey,
  createCoinSwapMulticall,
  DEADLINE_SEC,
  estimateCoinToCoinOutput,
  SWAP_FEE,
  withSlippage,
  ZAMMPoolKey,
} from "@/lib/swap";
import { nowSec } from "./utils";

export type Call = {
  to: Address;
  value?: bigint;
  data: Hex;
};

export interface SwapParams {
  address: `0x${string}`;
  sellToken: TokenMeta;
  buyToken: TokenMeta;
  sellAmt: string;
  buyAmt: string;
  reserves: { reserve0: bigint; reserve1: bigint };
  slippageBps: bigint;
  targetReserves?: { reserve0: bigint; reserve1: bigint };
}

/**
 * Builds the sequence of calls to perform a swap on-chain,
 * internally checking allowances and operator status.
 */
export async function buildSwapCalls(
  params: SwapParams & { publicClient: PublicClient },
): Promise<Call[]> {
  const {
    address,
    sellToken,
    buyToken,
    sellAmt,
    buyAmt,
    reserves,
    slippageBps,
    targetReserves,
    publicClient,
  } = params;
  const calls: Call[] = [];

  const isSellETH = sellToken.id === null;
  const isBuyETH = buyToken.id === null;
  const isCoinToCoin = !isSellETH && !isBuyETH;
  const isUSDT = (tok: TokenMeta) => tok.isCustomPool && tok.symbol === "USDT";

  const decimals = sellToken.decimals || 18;
  // Parse with correct decimals (6 for USDT, 18 for regular tokens)
  const sellAmtInUnits = parseUnits(sellAmt || "0", decimals);
  const minBuyAmount = withSlippage(
    parseUnits(buyAmt || "0", buyToken.decimals || 18),
    slippageBps,
  );
  const deadline = nowSec() + BigInt(DEADLINE_SEC);

  // 1. If selling USDT, check allowance and add approve if needed
  if (!isSellETH && isUSDT(sellToken)) {
    const allowance: bigint = await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, ZAMMAddress],
    });

    if (allowance < sellAmtInUnits) {
      calls.push({
        to: USDT_ADDRESS,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [ZAMMAddress, maxUint256],
        }) as Hex,
      });
    }
  }

  // 2. For non-ETH, non-USDT tokens, check operator and add setOperator if needed
  if (!isSellETH && !isUSDT(sellToken)) {
    const isOperator: boolean = await publicClient.readContract({
      address: CoinsAddress,
      abi: CoinsAbi,
      functionName: "isOperator",
      args: [address, ZAMMAddress],
    });

    if (!isOperator) {
      calls.push({
        to: CoinsAddress,
        data: encodeFunctionData({
          abi: CoinsAbi,
          functionName: "setOperator",
          args: [ZAMMAddress, true],
        }) as Hex,
      });
    }
  }

  // 3. Build the swap call(s)
  if (isCoinToCoin) {
    if (!targetReserves)
      throw new Error("targetReserves are required for coin-to-coin swaps");

    // Get correct swap fees for both pools
    const sourceSwapFee = sellToken.isCustomPool
      ? sellToken.swapFee || SWAP_FEE
      : SWAP_FEE;
    const targetSwapFee = buyToken?.isCustomPool
      ? buyToken.swapFee || SWAP_FEE
      : SWAP_FEE;

    // Estimate the final output amount and intermediate ETH amount
    const { withSlippage: minAmountOut, ethAmountOut } =
      estimateCoinToCoinOutput(
        sellToken.id!,
        buyToken.id!,
        sellAmtInUnits,
        reserves || { reserve0: 0n, reserve1: 0n }, // source reserves
        targetReserves, // target reserves
        slippageBps, // Use current slippage setting
        sourceSwapFee, // Pass source pool fee (could be 30n for USDT)
        targetSwapFee, // Pass target pool fee (could be 30n for USDT)
      );

    // Create the multicall data for coin-to-coin swap via ETH
    // We need to provide custom pool keys for USDT pools
    // Cast to any to avoid TypeScript errors with `0x${string}` format
    const sourcePoolKey =
      sellToken.isCustomPool && sellToken.poolKey
        ? (sellToken.poolKey as any)
        : computePoolKey(sellToken.id!, sellToken?.swapFee ?? SWAP_FEE);

    const targetPoolKey =
      buyToken.isCustomPool && buyToken.poolKey
        ? (buyToken.poolKey as any)
        : computePoolKey(buyToken.id!, buyToken?.swapFee ?? SWAP_FEE);

    const multicallData = createCoinSwapMulticall(
      sellToken.id!,
      buyToken.id!,
      sellAmtInUnits,
      ethAmountOut, // Pass the estimated ETH output for the second swap
      minAmountOut,
      address,
      sourcePoolKey, // Custom source pool key
      targetPoolKey, // Custom target pool key
    );

    calls.push({
      to: ZAMMAddress,
      data: encodeFunctionData({
        abi: ZAMMAbi,
        functionName: "multicall",
        args: [multicallData],
      }) as Hex,
    });
  } else {
    // Single-hop swapExactIn
    const poolKey =
      sellToken.isCustomPool || buyToken.isCustomPool
        ? sellToken.isCustomPool
          ? sellToken.poolKey!
          : buyToken.poolKey!
        : (computePoolKey(
            isSellETH ? buyToken.id! : sellToken.id!,
            isSellETH
              ? (buyToken?.swapFee ?? SWAP_FEE)
              : (sellToken?.swapFee ?? SWAP_FEE),
          ) as ZAMMPoolKey);
    const fromETH = isSellETH;
    const args = [
      poolKey,
      sellAmtInUnits,
      minBuyAmount,
      fromETH,
      address,
      deadline,
    ] as const;
    const call: Call = {
      to: ZAMMAddress,
      data: encodeFunctionData({
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args,
      }) as Hex,
    };
    if (fromETH) call.value = sellAmtInUnits;
    calls.push(call);
  }

  return calls;
}
