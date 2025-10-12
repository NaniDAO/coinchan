import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Address, formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { mainnet } from "viem/chains";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SlippageSettings } from "@/components/SlippageSettings";
import { SuccessMessage } from "@/components/SuccessMessage";
import { Loader2 } from "lucide-react";

import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { nowSec, formatNumber } from "@/lib/utils";
import { DEADLINE_SEC, SLIPPAGE_BPS, ZAMMPoolKey, withSlippage, type CookbookPoolKey } from "@/lib/swap";
import { handleWalletError } from "@/lib/errors";
import { useTokenSelection } from "@/contexts/TokenSelectionContext";
import { useReserves } from "@/hooks/use-reserves";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { SwapPanel } from "./SwapPanel";
import { CoinSource } from "@/lib/coins";
import { getProtocol, getProtocolIdBySource } from "@/lib/protocol";
import { CoinsAddress } from "@/constants/Coins";

// Helper function to calculate square root for LP token calculation
const sqrt = (value: bigint): bigint => {
  if (value < 0n) {
    throw new Error("Square root of negative numbers is not supported");
  }

  if (value === 0n) {
    return 0n;
  }

  // Newton's method
  let z = (value + 1n) / 2n;
  let y = value;
  while (z < y) {
    y = z;
    z = (value / z + z) / 2n;
  }
  return y;
};

interface ZCurveAddLiquidityProps {
  coinId: string;
  contractAddress?: Address;
  source: CoinSource;
  poolId?: string;
  feeOrHook?: bigint;
}

export function ZCurveAddLiquidity({
  coinId,
  contractAddress,
  source,
  poolId: providedPoolId,
  feeOrHook = 30n,
}: ZCurveAddLiquidityProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { sellToken, buyToken } = useTokenSelection();

  // State
  const [ethAmount, setEthAmount] = useState("");
  const [tokenAmount, setTokenAmount] = useState("");
  const [lastEditedField, setLastEditedField] = useState<"eth" | "token">("eth");
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  const [isCalculating, setIsCalculating] = useState(false);
  const [estimatedLpTokens, setEstimatedLpTokens] = useState<string>("");
  const [estimatedPoolShare, setEstimatedPoolShare] = useState<string>("");
  const [txError, setTxError] = useState<string | null>(null);

  // Compute pool ID if not provided
  const poolId = useMemo(() => {
    return BigInt(providedPoolId || computeZCurvePoolId(BigInt(coinId), feeOrHook));
  }, [providedPoolId, coinId, feeOrHook]);

  // Get ETH balance
  const { data: ethBalance } = useBalance({ address });

  const protocolId = getProtocolIdBySource(source);
  const protocol = protocolId ? getProtocol(protocolId) : null;
  // Get token balance
  const { data: tokenBalance } = useReadContract({
    address: protocol?.address || CookbookAddress,
    abi: protocol?.abi || CookbookAbi,
    functionName: "balanceOf",
    args: address ? [address, BigInt(coinId)] : undefined,
    query: { enabled: !!address },
  });

  // Get reserves
  const { data: reserves } = useReserves({
    poolId,
    source: source || ("COOKBOOK" as const),
  });

  // Get pool info for LP token calculation
  const { data: poolInfo } = useReadContract({
    address: protocol?.address || CookbookAddress,
    abi: protocol?.abi || CookbookAbi,
    functionName: "pools",
    args: [BigInt(poolId)],
    chainId: mainnet.id,
  });

  // Transaction handling
  const { data: hash, isPending, writeContractAsync } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  // Create enhanced token objects with balance information for SwapPanel
  const ethTokenWithBalance = useMemo(() => {
    if (!sellToken) return null;
    return {
      ...sellToken,
      balance: ethBalance?.value || 0n,
    };
  }, [sellToken, ethBalance]);

  const buyTokenWithBalance = useMemo(() => {
    if (!buyToken) return null;
    return {
      ...buyToken,
      balance: tokenBalance || 0n,
    };
  }, [buyToken, tokenBalance]);

  // Calculate expected LP tokens
  const calculateLpTokens = useCallback(
    (ethAmt: bigint, tokenAmt: bigint) => {
      if (!poolInfo || ethAmt === 0n || tokenAmt === 0n) {
        setEstimatedLpTokens("");
        setEstimatedPoolShare("");
        return;
      }

      try {
        const totalSupply = poolInfo[6] as bigint; // Total LP supply

        if (totalSupply > 0n && reserves?.reserve0 && reserves?.reserve1) {
          const lpFromEth = (ethAmt * totalSupply) / reserves.reserve0;
          const lpFromToken = (tokenAmt * totalSupply) / reserves.reserve1;
          const lpTokensToMint = lpFromEth < lpFromToken ? lpFromEth : lpFromToken;

          setEstimatedLpTokens(formatUnits(lpTokensToMint, 18));

          const newTotalSupply = totalSupply + lpTokensToMint;
          const poolShareBps = (lpTokensToMint * 10000n) / newTotalSupply;
          setEstimatedPoolShare(`${(Number(poolShareBps) / 100).toFixed(2)}%`);
        } else if (totalSupply === 0n) {
          const MINIMUM_LIQUIDITY = 1000n;
          const lpTokens = sqrt(ethAmt * tokenAmt) - MINIMUM_LIQUIDITY;
          setEstimatedLpTokens(formatUnits(lpTokens, 18));
          setEstimatedPoolShare("100%");
        }
      } catch (err) {
        console.error("Error calculating LP tokens:", err);
        setEstimatedLpTokens("");
        setEstimatedPoolShare("");
      }
    },
    [poolInfo, reserves],
  );

  // Auto-calculate the other amount based on reserves
  const calculateOtherAmount = useCallback(
    (value: string, field: "eth" | "token") => {
      if (!reserves || !value || parseFloat(value) === 0) {
        if (field === "eth") setTokenAmount("");
        else setEthAmount("");
        return;
      }

      setIsCalculating(true);

      try {
        const totalSupply = poolInfo?.[6] as bigint | undefined;
        const isFirstDeposit = !totalSupply || totalSupply === 0n;

        if (isFirstDeposit) {
          // For first deposit, allow any ratio
          setIsCalculating(false);
          return;
        }

        if (field === "eth") {
          // Calculate token amount based on ETH input
          const ethIn = parseEther(value);
          const expectedTokens = (ethIn * reserves.reserve1) / reserves.reserve0;
          setTokenAmount(formatUnits(expectedTokens, 18));
        } else {
          // Calculate ETH amount based on token input
          const tokensIn = parseUnits(value, 18);
          const expectedEth = (tokensIn * reserves.reserve0) / reserves.reserve1;
          setEthAmount(formatEther(expectedEth));
        }
      } catch (error) {
        console.error("Error calculating amounts:", error);
        if (field === "eth") setTokenAmount("");
        else setEthAmount("");
      } finally {
        setIsCalculating(false);
      }
    },
    [reserves, poolInfo],
  );

  // Handle input changes
  useEffect(() => {
    if (lastEditedField === "eth" && ethAmount) {
      calculateOtherAmount(ethAmount, "eth");
    } else if (lastEditedField === "token" && tokenAmount) {
      calculateOtherAmount(tokenAmount, "token");
    }
  }, [ethAmount, tokenAmount, lastEditedField, calculateOtherAmount]);

  // Update LP token estimate when amounts change
  useEffect(() => {
    if (ethAmount && tokenAmount) {
      try {
        const ethAmt = parseEther(ethAmount);
        const tokenAmt = parseUnits(tokenAmount, 18);
        calculateLpTokens(ethAmt, tokenAmt);
      } catch {
        setEstimatedLpTokens("");
        setEstimatedPoolShare("");
      }
    } else {
      setEstimatedLpTokens("");
      setEstimatedPoolShare("");
    }
  }, [ethAmount, tokenAmount, calculateLpTokens]);

  const handleAddLiquidity = async () => {
    if (!address || !isConnected || !buyToken) {
      setTxError("Wallet not connected");
      return;
    }

    if (!ethAmount || !tokenAmount) {
      setTxError("Please enter amounts");
      return;
    }

    setTxError(null);

    try {
      const amount0 = parseEther(ethAmount); // ETH amount
      const amount1 = parseUnits(tokenAmount, 18); // Token amount

      let poolKey: ZAMMPoolKey | CookbookPoolKey;
      if (protocolId === "ZAMMV0") {
        // Create pool key
        poolKey = {
          id0: 0n, // ETH
          id1: BigInt(buyToken.id || coinId),
          token0: "0x0000000000000000000000000000000000000000" as const,
          token1: contractAddress ?? CoinsAddress,
          swapFee: feeOrHook,
        };
      } else {
        // Create pool key
        poolKey = {
          id0: 0n, // ETH
          id1: BigInt(buyToken.id || coinId),
          token0: "0x0000000000000000000000000000000000000000" as const,
          token1: CookbookAddress,
          feeOrHook,
        };
      }

      // Calculate minimum amounts with slippage
      const amount0Min = withSlippage(amount0, slippageBps);
      const amount1Min = withSlippage(amount1, slippageBps);

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      await writeContractAsync({
        address: protocol?.address || CookbookAddress,
        abi: protocol?.abi || CookbookAbi,
        functionName: "addLiquidity",
        // @ts-expect-error
        args: [poolKey, amount0, amount1, amount0Min, amount1Min, address, deadline],
        value: amount0, // Send ETH
      });

      // Clear inputs on success
      setEthAmount("");
      setTokenAmount("");
    } catch (error) {
      const errorMsg = handleWalletError(error, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setTxError(errorMsg);
      }
    }
  };

  if (!ethTokenWithBalance || !buyTokenWithBalance) {
    return (
      <Alert>
        <AlertDescription>Loading pool information...</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {t("liquidity.add_liquidity_description", "Add liquidity to earn fees from trades")}
      </div>

      {/* ETH Input - Using SwapPanel correctly */}
      <SwapPanel
        title={t("common.eth_amount")}
        selectedToken={ethTokenWithBalance}
        tokens={[ethTokenWithBalance]}
        amount={ethAmount}
        onAmountChange={(value) => {
          setEthAmount(value);
          setLastEditedField("eth");
        }}
        onSelect={() => {}}
        isEthBalanceFetching={isPending}
        showMaxButton={true}
        onMax={() => {
          const maxEth = ethBalance?.value ? formatEther((ethBalance.value * 99n) / 100n) : "0";
          setEthAmount(maxEth);
          setLastEditedField("eth");
        }}
        showPercentageSlider={true}
        onPercentageChange={() => setLastEditedField("eth")}
        disabled={isPending}
        isLoading={isCalculating && lastEditedField === "token"}
      />

      {/* Token Input - Using SwapPanel correctly */}
      <SwapPanel
        title={`${buyTokenWithBalance.symbol} ${t("common.amount")}`}
        selectedToken={buyTokenWithBalance}
        tokens={[buyTokenWithBalance]}
        amount={tokenAmount}
        onAmountChange={(value) => {
          setTokenAmount(value);
          setLastEditedField("token");
        }}
        onSelect={() => {}}
        isEthBalanceFetching={isPending || isCalculating}
        showMaxButton={true}
        onMax={() => {
          const maxTokens = tokenBalance ? formatUnits(tokenBalance, 18) : "0";
          setTokenAmount(maxTokens);
          setLastEditedField("token");
        }}
        showPercentageSlider={true}
        onPercentageChange={() => setLastEditedField("token")}
        disabled={isPending}
        isLoading={isCalculating && lastEditedField === "eth"}
      />

      {/* LP Token Estimate */}
      {estimatedLpTokens && (
        <Alert>
          <AlertDescription>
            <div className="space-y-1">
              <div>
                {t("liquidity.estimated_lp_tokens")}: {formatNumber(parseFloat(estimatedLpTokens), 6)} LP
              </div>
              <div>
                {t("liquidity.pool_share")}: {estimatedPoolShare}
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Slippage Settings */}
      <SlippageSettings
        slippageBps={slippageBps}
        setSlippageBps={setSlippageBps}
        slippageOptions={[
          { label: "0.5%", value: 50n },
          { label: "1%", value: 100n },
          { label: "3%", value: 300n },
          { label: "5%", value: 500n },
        ]}
      />

      {/* Error Message */}
      {txError && (
        <Alert tone="destructive">
          <AlertDescription>{txError}</AlertDescription>
        </Alert>
      )}

      {/* Success Message */}
      {isSuccess && <SuccessMessage />}

      {/* Add Liquidity Button */}
      <Button
        onClick={handleAddLiquidity}
        disabled={!isConnected || isPending || !ethAmount || !tokenAmount || isCalculating}
        className="w-full"
        size="lg"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.confirming")}
          </>
        ) : (
          t("liquidity.add_liquidity")
        )}
      </Button>
    </div>
  );
}
