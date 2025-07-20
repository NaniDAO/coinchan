import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CultHookAbi, CultHookAddress } from "@/constants/CultHook";
import { type TokenMeta, USDT_ADDRESS, CULT_ADDRESS, CULT_POOL_KEY } from "@/lib/coins";
import { getCultHookTaxRate, toGross } from "@/lib/cult-hook-utils";
import {
  DEADLINE_SEC,
  SWAP_FEE,
  type ZAMMPoolKey,
  computePoolKey,
  createCoinSwapMulticall,
  estimateCoinToCoinOutput,
  withSlippage,
  getAmountIn,
} from "@/lib/swap";
import { encodeFunctionData, erc20Abi, maxUint256, parseUnits } from "viem";
import type { Address, Hex, PublicClient } from "viem";
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
  recipient?: `0x${string}`; // Optional custom recipient address
  exactOut?: boolean; // If true, use swapExactOut instead of swapExactIn
}

/**
 * Builds the sequence of calls to perform a swap on-chain,
 * internally checking allowances and operator status.
 */
export async function buildSwapCalls(params: SwapParams & { publicClient: PublicClient }): Promise<Call[]> {
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
    recipient,
    exactOut,
  } = params;
  const calls: Call[] = [];

  // Use custom recipient if provided, otherwise default to connected wallet
  // Validate the recipient is a valid address
  const swapRecipient = recipient && recipient.match(/^0x[a-fA-F0-9]{40}$/i) ? recipient : address;

  const isSellETH = sellToken.id === null;
  const isBuyETH = buyToken.id === null;
  const isCoinToCoin = !isSellETH && !isBuyETH;
  const isUSDT = (tok: TokenMeta) => tok.isCustomPool && tok.symbol === "USDT";
  const isCULT = (tok: TokenMeta) => tok.isCustomPool && tok.symbol === "CULT";

  // Check if this swap involves the CULT hook
  const isCultHookSwap = (isSellETH && isCULT(buyToken)) || (isCULT(sellToken) && isBuyETH);

  const decimals = sellToken.decimals || 18;
  // Parse with correct decimals (6 for USDT, 18 for regular tokens)
  const sellAmtInUnits = parseUnits(sellAmt || "0", decimals);
  const buyAmtInUnits = parseUnits(buyAmt || "0", buyToken.decimals || 18);
  const minBuyAmount = withSlippage(buyAmtInUnits, slippageBps);
  const deadline = nowSec() + BigInt(DEADLINE_SEC);

  // For exactOut, we need to calculate max input amount based on desired output
  let maxSellAmount = sellAmtInUnits;
  if (exactOut && !isCoinToCoin) {
    // In exactOut mode, we need to calculate the maximum input we'd need
    // to get the exact output (buyAmtInUnits) with slippage protection
    if (!reserves) throw new Error("Reserves required for exactOut calculations");

    const isETHToToken = isSellETH;
    const outputAmount = buyAmtInUnits;

    // Calculate required input using getAmountIn
    const requiredInput = getAmountIn(
      outputAmount,
      isETHToToken ? reserves.reserve0 : reserves.reserve1,
      isETHToToken ? reserves.reserve1 : reserves.reserve0,
      sellToken.swapFee || buyToken?.swapFee || SWAP_FEE,
    );

    // Add slippage buffer to the calculated input
    maxSellAmount = requiredInput + (requiredInput * slippageBps) / 10000n;
  }

  // 1. If selling USDT, check allowance and add approve if needed
  if (!isSellETH && isUSDT(sellToken)) {
    const allowance: bigint = await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, ZAMMAddress],
    });

    // For exactOut, we need to approve the max amount we might spend
    const approvalAmount = exactOut ? maxSellAmount : sellAmtInUnits;
    if (allowance < approvalAmount) {
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

  // 1b. If selling CULT, check allowance for CultHook and add approve if needed
  if (!isSellETH && isCULT(sellToken)) {
    const allowance: bigint = await publicClient.readContract({
      address: CULT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, CultHookAddress],
    });

    // For exactOut, we need to approve the max amount we might spend
    const approvalAmount = exactOut ? maxSellAmount : sellAmtInUnits;
    if (allowance < approvalAmount) {
      calls.push({
        to: CULT_ADDRESS,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [CultHookAddress, maxUint256],
        }) as Hex,
      });
    }
  }

  // 2. For non-ETH, non-USDT, non-CULT tokens, check operator and add setOperator if needed
  if (!isSellETH && !isUSDT(sellToken) && !isCULT(sellToken)) {
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
    if (!targetReserves) throw new Error("targetReserves are required for coin-to-coin swaps");

    // Get correct swap fees for both pools
    const sourceSwapFee = sellToken.isCustomPool ? sellToken.swapFee || SWAP_FEE : SWAP_FEE;
    const targetSwapFee = buyToken?.isCustomPool ? buyToken.swapFee || SWAP_FEE : SWAP_FEE;

    // Estimate the final output amount and intermediate ETH amount
    const { withSlippage: minAmountOut, ethAmountOut } = estimateCoinToCoinOutput(
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
      swapRecipient, // Use the recipient address
      sourcePoolKey, // Custom source pool key
      targetPoolKey, // Custom target pool key
    );

    // @TODO: add multihop support for cookbook
    calls.push({
      to: ZAMMAddress,
      data: encodeFunctionData({
        abi: ZAMMAbi,
        functionName: "multicall",
        args: [multicallData],
      }) as Hex,
    });
  } else {
    // Single-hop swap
    const poolKey =
      sellToken.isCustomPool || buyToken.isCustomPool
        ? sellToken.isCustomPool
          ? sellToken.poolKey!
          : buyToken.poolKey!
        : (computePoolKey(
            isSellETH ? buyToken.id! : sellToken.id!,
            isSellETH ? (buyToken?.swapFee ?? SWAP_FEE) : (sellToken?.swapFee ?? SWAP_FEE),
            isSellETH
              ? buyToken.source === "ZAMM"
                ? CoinsAddress
                : CookbookAddress
              : sellToken.source === "ZAMM"
                ? CoinsAddress
                : CookbookAddress,
          ) as ZAMMPoolKey);
    const fromETH = isSellETH;
    const source = fromETH ? buyToken.source : sellToken.source;

    // Handle CultHook routing for CULT swaps
    if (isCultHookSwap) {
      // Get tax rate for accurate calculations
      const taxRate = await getCultHookTaxRate();

      if (exactOut) {
        // For exactOut CULT swaps, we need to adjust parameters
        let adjustedMaxAmount = maxSellAmount;
        let msgValue = 0n;

        if (fromETH) {
          // ETH → CULT: User wants exact CULT out, we need to provide gross ETH
          msgValue = toGross(maxSellAmount, taxRate);
          adjustedMaxAmount = maxSellAmount; // CultHook expects net amount as parameter
        } else {
          // CULT → ETH: User wants exact net ETH out
          // CultHook will handle the tax internally
        }

        const args = [CULT_POOL_KEY, buyAmtInUnits, adjustedMaxAmount, fromETH, swapRecipient, deadline] as const;
        const call: Call = {
          to: CultHookAddress,
          data: encodeFunctionData({
            abi: CultHookAbi,
            functionName: "swapExactOut",
            args,
          }) as Hex,
        };
        if (fromETH) call.value = msgValue;
        calls.push(call);
      } else {
        // swapExactIn for CULT swaps
        let adjustedAmount = sellAmtInUnits;
        let msgValue = 0n;

        if (fromETH) {
          // ETH → CULT: User provides net ETH, we send gross
          msgValue = toGross(sellAmtInUnits, taxRate);
          adjustedAmount = sellAmtInUnits; // CultHook expects net amount
        } else {
          // CULT → ETH: Standard amount, tax handled by hook
        }

        const args = [CULT_POOL_KEY, adjustedAmount, minBuyAmount, fromETH, swapRecipient, deadline] as const;
        const call: Call = {
          to: CultHookAddress,
          data: encodeFunctionData({
            abi: CultHookAbi,
            functionName: "swapExactIn",
            args,
          }) as Hex,
        };
        if (fromETH) call.value = msgValue;
        calls.push(call);
      }
    } else {
      // Regular non-CULT swap logic
      if (exactOut) {
        // swapExactOut: we want exactly buyAmtInUnits output, with maxSellAmount as input limit
        const args = [poolKey, buyAmtInUnits, maxSellAmount, fromETH, swapRecipient, deadline] as const;
        const call: Call = {
          to: source === "ZAMM" ? ZAMMAddress : CookbookAddress,
          data: encodeFunctionData({
            abi: source === "ZAMM" ? ZAMMAbi : CookbookAbi,
            functionName: "swapExactOut",
            args,
          }) as Hex,
        };
        if (fromETH) call.value = maxSellAmount;
        calls.push(call);
      } else {
        // swapExactIn: we have exactly sellAmtInUnits input, with minBuyAmount as output minimum
        const args = [poolKey, sellAmtInUnits, minBuyAmount, fromETH, swapRecipient, deadline] as const;
        const call: Call = {
          to: source === "ZAMM" ? ZAMMAddress : CookbookAddress,
          data: encodeFunctionData({
            abi: source === "ZAMM" ? ZAMMAbi : CookbookAbi,
            functionName: "swapExactIn",
            args,
          }) as Hex,
        };
        if (fromETH) call.value = sellAmtInUnits;
        calls.push(call);
      }
    }
  }

  return calls;
}
