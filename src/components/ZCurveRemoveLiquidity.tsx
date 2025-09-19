import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, formatUnits, parseUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { mainnet } from "viem/chains";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenImage } from "@/components/TokenImage";
import { SlippageSettings } from "@/components/SlippageSettings";
import { SuccessMessage } from "@/components/SuccessMessage";
import { Loader2 } from "lucide-react";

import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";
import { nowSec, formatNumber } from "@/lib/utils";
import {
  DEADLINE_SEC,
  SLIPPAGE_BPS,
  withSlippage,
  type CookbookPoolKey,
} from "@/lib/swap";
import { handleWalletError } from "@/lib/errors";
import { useTokenSelection } from "@/contexts/TokenSelectionContext";
import { useReserves } from "@/hooks/use-reserves";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";

interface ZCurveRemoveLiquidityProps {
  coinId: string;
  poolId?: string;
  feeOrHook?: bigint;
}

export function ZCurveRemoveLiquidity({
  coinId,
  poolId: providedPoolId,
  feeOrHook = 30n,
}: ZCurveRemoveLiquidityProps) {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const { sellToken, buyToken } = useTokenSelection();

  // State
  const [lpAmount, setLpAmount] = useState("");
  const [percentage, setPercentage] = useState(0);
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  const [estimatedEth, setEstimatedEth] = useState<string>("");
  const [estimatedTokens, setEstimatedTokens] = useState<string>("");
  const [txError, setTxError] = useState<string | null>(null);

  // Compute pool ID if not provided
  const poolId = useMemo(() => {
    return BigInt(
      providedPoolId || computeZCurvePoolId(BigInt(coinId), feeOrHook),
    );
  }, [providedPoolId, coinId, feeOrHook]);

  // Get LP token balance
  const { data: lpBalance } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "balanceOf",
    args: address ? [address, BigInt(poolId)] : undefined,
    query: { enabled: !!address },
  });

  // Get reserves
  const { data: reserves } = useReserves({
    poolId,
    source: "COOKBOOK" as const,
  });

  // Get pool info
  const { data: poolInfo } = useReadContract({
    address: CookbookAddress,
    abi: CookbookAbi,
    functionName: "pools",
    args: [BigInt(poolId)],
    chainId: mainnet.id,
  });

  // Transaction handling
  const { data: hash, isPending, writeContractAsync } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash });

  // Calculate expected outputs
  const calculateOutputs = useCallback(
    (lpTokens: bigint) => {
      if (!poolInfo || !reserves || lpTokens === 0n) {
        setEstimatedEth("");
        setEstimatedTokens("");
        return;
      }

      try {
        const totalSupply = poolInfo[6] as bigint;

        if (totalSupply > 0n) {
          // Calculate proportional amounts
          const amount0 = (lpTokens * reserves.reserve0) / totalSupply;
          const amount1 = (lpTokens * reserves.reserve1) / totalSupply;

          setEstimatedEth(formatEther(amount0));
          setEstimatedTokens(formatUnits(amount1, 18));
        }
      } catch (err) {
        console.error("Error calculating outputs:", err);
        setEstimatedEth("");
        setEstimatedTokens("");
      }
    },
    [poolInfo, reserves],
  );

  // Update outputs when LP amount changes
  useEffect(() => {
    if (lpAmount) {
      try {
        const lpTokens = parseUnits(lpAmount, 18);
        calculateOutputs(lpTokens);
      } catch {
        setEstimatedEth("");
        setEstimatedTokens("");
      }
    } else {
      setEstimatedEth("");
      setEstimatedTokens("");
    }
  }, [lpAmount, calculateOutputs]);

  // Handle percentage changes
  const handlePercentageChange = (value: number[]) => {
    const newPercentage = value[0];
    setPercentage(newPercentage);

    if (lpBalance) {
      const amount = (lpBalance * BigInt(newPercentage)) / 100n;
      setLpAmount(formatUnits(amount, 18));
    }
  };

  // Handle LP amount changes
  const handleLpAmountChange = (value: string) => {
    setLpAmount(value);

    if (lpBalance && value) {
      try {
        const amount = parseUnits(value, 18);
        const newPercentage = Number((amount * 100n) / lpBalance);
        setPercentage(Math.min(100, Math.max(0, newPercentage)));
      } catch {
        setPercentage(0);
      }
    } else {
      setPercentage(0);
    }
  };

  const handleRemoveLiquidity = async () => {
    if (!address || !isConnected || !buyToken) {
      setTxError("Wallet not connected");
      return;
    }

    if (!lpAmount) {
      setTxError("Please enter an amount");
      return;
    }

    setTxError(null);

    try {
      const lpTokens = parseUnits(lpAmount, 18);

      // Calculate minimum amounts with slippage
      const totalSupply = poolInfo?.[6] as bigint;
      const amount0 =
        totalSupply > 0n
          ? (lpTokens * (reserves?.reserve0 || 0n)) / totalSupply
          : 0n;
      const amount1 =
        totalSupply > 0n
          ? (lpTokens * (reserves?.reserve1 || 0n)) / totalSupply
          : 0n;

      const amount0Min = withSlippage(amount0, slippageBps);
      const amount1Min = withSlippage(amount1, slippageBps);

      // Create pool key
      const poolKey: CookbookPoolKey = {
        id0: 0n, // ETH
        id1: BigInt(buyToken.id || coinId),
        token0: "0x0000000000000000000000000000000000000000" as const,
        token1: CookbookAddress,
        feeOrHook,
      };

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // Remove liquidity
      await writeContractAsync({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "removeLiquidity",
        args: [poolKey, lpTokens, amount0Min, amount1Min, address, deadline],
      });

      // Clear inputs on success
      setLpAmount("");
      setPercentage(0);
    } catch (error) {
      const errorMsg = handleWalletError(error, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        setTxError(errorMsg);
      }
    }
  };

  const handleMax = () => {
    if (lpBalance) {
      setLpAmount(formatUnits(lpBalance, 18));
      setPercentage(100);
    }
  };

  if (!sellToken || !buyToken) {
    return (
      <Alert>
        <AlertDescription>Loading pool information...</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {t(
          "liquidity.remove_liquidity_description",
          "Remove liquidity to get back ETH and tokens",
        )}
      </div>

      {/* LP Token Input */}
      <div className="space-y-2">
        <Label>{t("liquidity.lp_tokens")}</Label>
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="0.0"
            value={lpAmount}
            onChange={(e) => handleLpAmountChange(e.target.value)}
            disabled={isPending}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleMax}
            disabled={!lpBalance || lpBalance === 0n}
          >
            {t("common.max")}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          {t("common.balance")}: {formatUnits(lpBalance || 0n, 18)} LP
        </div>
      </div>

      {/* Percentage Buttons */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{t("liquidity.remove_percentage")}</span>
          <span>{percentage}%</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePercentageChange([25])}
            disabled={!lpBalance || lpBalance === 0n || isPending}
          >
            25%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePercentageChange([50])}
            disabled={!lpBalance || lpBalance === 0n || isPending}
          >
            50%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePercentageChange([75])}
            disabled={!lpBalance || lpBalance === 0n || isPending}
          >
            75%
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePercentageChange([100])}
            disabled={!lpBalance || lpBalance === 0n || isPending}
          >
            100%
          </Button>
        </div>
      </div>

      {/* Expected Outputs */}
      {(estimatedEth || estimatedTokens) && (
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {t("liquidity.you_will_receive")}:
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 flex-shrink-0">
                  <TokenImage
                    imageUrl={sellToken.imageUrl}
                    symbol={sellToken.symbol}
                  />
                </div>
                <span className="ml-1">
                  {formatNumber(parseFloat(estimatedEth), 6)} ETH
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 flex-shrink-0">
                  <TokenImage
                    imageUrl={buyToken.imageUrl}
                    symbol={buyToken.symbol}
                  />
                </div>
                <span className="ml-1">
                  {formatNumber(parseFloat(estimatedTokens), 6)}{" "}
                  {buyToken.symbol}
                </span>
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

      {/* Remove Liquidity Button */}
      <Button
        onClick={handleRemoveLiquidity}
        disabled={
          !isConnected || isPending || !lpAmount || parseFloat(lpAmount) === 0
        }
        className="w-full"
        size="lg"
        variant="destructive"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("common.confirming")}
          </>
        ) : (
          t("liquidity.remove_liquidity")
        )}
      </Button>
    </div>
  );
}
