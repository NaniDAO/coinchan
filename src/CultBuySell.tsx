import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { ZAMMAbi, ZAMMAddress } from "@/constants/ZAAM";
import { CultHookAbi, CultHookAddress } from "@/constants/CultHook";
import {
  type TokenMeta,
  USDT_ADDRESS,
  CULT_ADDRESS,
  CULT_POOL_KEY,
} from "@/lib/coins";
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
import { nowSec } from "./lib/utils";

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
  recipient?: `0x${string}`;
  exactOut?: boolean;
}

export async function buildSwapCalls(
  params: SwapParams & { publicClient: PublicClient }
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
    recipient,
    exactOut,
  } = params;

  const calls: Call[] = [];

  // Determine swap context
  const swapRecipient = 
    recipient && /^0x[a-fA-F0-9]{40}$/.test(recipient)
      ? recipient
      : address;

  const isSellETH = sellToken.id === null;
  const isBuyETH = buyToken.id === null;
  const isCoinToCoin = !isSellETH && !isBuyETH;
  const isUSDT = (tok: TokenMeta) =>
    tok.isCustomPool && tok.symbol === "USDT";
  const isCULT = (tok: TokenMeta) =>
    tok.isCustomPool && tok.symbol === "CULT";
  const isCultHookSwap =
    (isSellETH && isCULT(buyToken)) ||
    (isCULT(sellToken) && isBuyETH);

  // 1. Fetch tax rate for CULT-hook swaps
  const cultTaxRate = isCultHookSwap
    ? await getCultHookTaxRate()
    : 0n;

  // 2. Bake in tax as extra slippage for minimum-out
  const effectiveSlippageBps = slippageBps + cultTaxRate;

  // 3. Parse amounts into token units
  const sellAmtInUnits = parseUnits(
    sellAmt || "0",
    sellToken.decimals || 18
  );
  const buyAmtInUnits = parseUnits(
    buyAmt || "0",
    buyToken.decimals || 18
  );

  // 4. Compute min-out for swapExactIn (includes tax as slippage on CULT)
  const minBuyAmount = withSlippage(
    buyAmtInUnits,
    effectiveSlippageBps
  );

  // 5. Deadline
  const deadline = nowSec() + BigInt(DEADLINE_SEC);

  // 6. Compute max-in for swapExactOut (unchanged for single-hop non-coin-to-coin)
  let maxSellAmount = sellAmtInUnits;
  if (exactOut && !isCoinToCoin) {
    if (!reserves) {
      throw new Error("Reserves required for exactOut calculations");
    }
    const [r0, r1] = isSellETH
      ? [reserves.reserve0, reserves.reserve1]
      : [reserves.reserve1, reserves.reserve0];

    const requiredInput = getAmountIn(
      buyAmtInUnits,
      r0,
      r1,
      sellToken.swapFee ?? SWAP_FEE
    );

    // apply only user slippage here — tax is delivered via toGross when sending ETH
    maxSellAmount =
      requiredInput +
      (requiredInput * slippageBps) / 10000n;
  }

  // 7. Allowance checks
  // 7a. USDT approval
  if (!isSellETH && isUSDT(sellToken)) {
    const allowance = (await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, ZAMMAddress],
    })) as bigint;

    const needed = exactOut ? maxSellAmount : sellAmtInUnits;
    if (allowance < needed) {
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

  // 7b. CULT approval
  if (!isSellETH && isCULT(sellToken)) {
    const allowance = (await publicClient.readContract({
      address: CULT_ADDRESS,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, CultHookAddress],
    })) as bigint;

    const needed = exactOut ? maxSellAmount : sellAmtInUnits;
    if (allowance < needed) {
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

  // 7c. Other tokens: setOperator if needed
  if (
    !isSellETH &&
    !isUSDT(sellToken) &&
    !isCULT(sellToken)
  ) {
    const isOperator = (await publicClient.readContract({
      address: CoinsAddress,
      abi: CoinsAbi,
      functionName: "isOperator",
      args: [address, ZAMMAddress],
    })) as boolean;

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

  // 8. Build swap call(s)
  if (isCoinToCoin) {
    if (!targetReserves) {
      throw new Error("targetReserves are required for coin-to-coin swaps");
    }
    const sourceSwapFee = sellToken.isCustomPool
      ? sellToken.swapFee ?? SWAP_FEE
      : SWAP_FEE;
    const targetSwapFee = buyToken.isCustomPool
      ? buyToken.swapFee ?? SWAP_FEE
      : SWAP_FEE;

    const { withSlippage: minAmountOut, ethAmountOut } =
      estimateCoinToCoinOutput(
        sellToken.id!,
        buyToken.id!,
        sellAmtInUnits,
        reserves,
        targetReserves,
        slippageBps,
        sourceSwapFee,
        targetSwapFee
      );

    const sourcePoolKey = sellToken.isCustomPool
      ? (sellToken.poolKey as unknown as ZAMMPoolKey)
      : computePoolKey(
          sellToken.id!,
          sellToken.swapFee ?? SWAP_FEE
        );
    const targetPoolKey = buyToken.isCustomPool
      ? (buyToken.poolKey as unknown as ZAMMPoolKey)
      : computePoolKey(
          buyToken.id!,
          buyToken.swapFee ?? SWAP_FEE
        );

    const multicallData = createCoinSwapMulticall(
      sellToken.id!,
      buyToken.id!,
      sellAmtInUnits,
      ethAmountOut,
      minAmountOut,
      swapRecipient,
      sourcePoolKey,
      targetPoolKey
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
    // single-hop swap
    const poolKey =
      sellToken.isCustomPool || buyToken.isCustomPool
        ? (sellToken.isCustomPool
            ? sellToken.poolKey!
            : buyToken.poolKey!) as ZAMMPoolKey
        : (computePoolKey(
            isSellETH ? buyToken.id! : sellToken.id!,
            isSellETH
              ? buyToken.swapFee ?? SWAP_FEE
              : sellToken.swapFee ?? SWAP_FEE,
            isSellETH
              ? buyToken.source === "ZAMM"
                ? CoinsAddress
                : CookbookAddress
              : sellToken.source === "ZAMM"
              ? CoinsAddress
              : CookbookAddress
          ) as ZAMMPoolKey);

    const fromETH = isSellETH;
    const source = fromETH
      ? buyToken.source
      : sellToken.source;

    if (isCultHookSwap) {
      // CULT-hook swap
      if (exactOut) {
        const netMax = maxSellAmount;
        const msgValue = fromETH
          ? toGross(netMax, cultTaxRate)
          : 0n;
        const args = [
          CULT_POOL_KEY,
          buyAmtInUnits,
          netMax,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to: CultHookAddress,
          data: encodeFunctionData({
            abi: CultHookAbi,
            functionName: "swapExactOut",
            args,
          }) as Hex,
          ...(fromETH ? { value: msgValue } : {}),
        });
      } else {
        const netIn = sellAmtInUnits;
        const msgValue = fromETH
          ? toGross(netIn, cultTaxRate)
          : 0n;
        const args = [
          CULT_POOL_KEY,
          netIn,
          minBuyAmount,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to: CultHookAddress,
          data: encodeFunctionData({
            abi: CultHookAbi,
            functionName: "swapExactIn",
            args,
          }) as Hex,
          ...(fromETH ? { value: msgValue } : {}),
        });
      }
    } else {
      // regular swap
      if (exactOut) {
        const args = [
          poolKey,
          buyAmtInUnits,
          maxSellAmount,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to:
            source === "ZAMM"
              ? ZAMMAddress
              : CookbookAddress,
          data: encodeFunctionData({
            abi:
              source === "ZAMM"
                ? ZAMMAbi
                : CookbookAbi,
            functionName: "swapExactOut",
            args,
          }) as Hex,
          ...(fromETH ? { value: maxSellAmount } : {}),
        });
      } else {
        const args = [
          poolKey,
          sellAmtInUnits,
          minBuyAmount,
          fromETH,
          swapRecipient,
          deadline,
        ] as const;
        calls.push({
          to:
            source === "ZAMM"
              ? ZAMMAddress
              : CookbookAddress,
          data: encodeFunctionData({
            abi:
              source === "ZAMM"
                ? ZAMMAbi
                : CookbookAbi,
            functionName: "swapExactIn",
            args,
          }) as Hex,
          ...(fromETH ? { value: sellAmtInUnits } : {}),
        });
      }
    }
  }

  return calls;
}
