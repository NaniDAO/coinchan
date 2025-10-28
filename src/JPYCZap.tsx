import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { parseEther, formatEther, formatUnits } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Button } from "./components/ui/button";
import { SwapPanel } from "./components/SwapPanel";
import { SlippageSettings } from "./components/SlippageSettings";
import { LoadingLogo } from "./components/ui/loading-logo";
import { CheckIcon, Loader2, ExternalLink } from "lucide-react";
import { ZAMMZapETHJPYCAbi, ZAMMZapETHJPYCAddress } from "./constants/ZAMMZapETHJPYC";
import { ETH_TOKEN, JPYC_POOL_KEY } from "./lib/coins";
import { useJpycZapPreview } from "./hooks/use-jpyc-zap-preview";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { formatNumber } from "./lib/utils";
import { ConnectMenu } from "./ConnectMenu";

/**
 * JPYCZap - Smart zapper for ETH → JPYC → LP
 *
 * Uses ZAMMZapETHJPYC contract (0x644C22269b0572f22a3FccB9CDE24B604F56eC03)
 * which automatically finds the best source of JPYC across multiple DEXs
 * (Uniswap V2/V3, Sushiswap, Curve, or ZAMM) using zQuoter, then executes
 * the swap and LP addition in a single transaction via zRouter.
 */
// Custom slippage options for JPYC zap (higher due to low liquidity)
const JPYC_ZAP_SLIPPAGE_OPTIONS = [
  { label: "2%", value: 200n },
  { label: "3%", value: 300n },
  { label: "5%", value: 500n },
  { label: "10%", value: 1000n },
];

export const JPYCZap = () => {
  const { t } = useTranslation();
  const { address, isConnected } = useAccount();
  const [ethAmount, setEthAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<bigint>(500n); // 5% default for low liquidity
  const [swapBps] = useState<bigint>(5000n); // 50/50 split
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  // Get preview from the zap contract
  const { data: zapPreview, isLoading: isLoadingPreview } = useJpycZapPreview({
    ethAmount,
    swapBps,
    slippageBps,
    userAddress: address,
    enabled: !!ethAmount && parseFloat(ethAmount) > 0,
  });

  // Reset transaction state when amount or slippage changes
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
  }, [ethAmount, slippageBps]);

  // Reset on success
  useEffect(() => {
    if (isSuccess) {
      setEthAmount("");
      setTxHash(undefined);
      setTxError(null);
    }
  }, [isSuccess]);

  const executeZap = async () => {
    if (!address || !ethAmount || parseFloat(ethAmount) <= 0) {
      setTxError(t("errors.invalid_amount"));
      return;
    }

    setTxError(null);

    try {
      const ethTotalWei = parseEther(ethAmount);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 15 * 60); // 15 minutes

      const hash = await writeContractAsync({
        address: ZAMMZapETHJPYCAddress,
        abi: ZAMMZapETHJPYCAbi,
        functionName: "zapAndAddLiquidity",
        args: [JPYC_POOL_KEY as any, swapBps, slippageBps, deadline, address],
        value: ethTotalWei,
      });

      setTxHash(hash);
    } catch (err: unknown) {
      if (!isUserRejectionError(err)) {
        const errorMsg = handleWalletError(err);
        if (errorMsg) {
          console.error("JPYC zap execution error:", err);
          setTxError(errorMsg);
        }
      }
    }
  };

  const isButtonDisabled = !isConnected || !ethAmount || parseFloat(ethAmount) <= 0 || isPending || isConfirming;

  const buttonText = useMemo(() => {
    if (!isConnected) return t("common.connect_wallet");
    if (isPending) return t("common.confirm_in_wallet");
    if (isConfirming) return t("common.confirming");
    if (isSuccess) return t("common.success");
    return t("jpyc.zap_and_add_liq");
  }, [isConnected, isPending, isConfirming, isSuccess, t]);

  return (
    <div className="space-y-4">
      {/* ETH Input Panel */}
      <SwapPanel
        title={t("common.you_pay")}
        selectedToken={ETH_TOKEN}
        tokens={[ETH_TOKEN]}
        onSelect={() => {}} // Single token selection
        isEthBalanceFetching={false}
        amount={ethAmount}
        onAmountChange={setEthAmount}
        showMaxButton={true}
        onMax={() => {
          if (ETH_TOKEN.balance) {
            // Reserve ~0.01 ETH for gas
            const maxEth = ETH_TOKEN.balance - parseEther("0.01");
            if (maxEth > 0n) {
              setEthAmount(formatEther(maxEth));
            }
          }
        }}
      />

      {/* Slippage Settings */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-muted-foreground">{t("common.slippage_tolerance")}</span>
        <SlippageSettings
          slippageBps={slippageBps}
          setSlippageBps={setSlippageBps}
          slippageOptions={JPYC_ZAP_SLIPPAGE_OPTIONS}
        />
      </div>

      {/* Preview Information */}
      {zapPreview && !isLoadingPreview && (
        <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2">
          <div className="text-sm font-medium text-foreground mb-2">{t("jpyc.zap_preview")}</div>

          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("jpyc.eth_for_swap")}:</span>
              <span className="font-mono">{formatNumber(Number(formatEther(zapPreview.ethSwap)), 6)} ETH</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("jpyc.eth_for_lp")}:</span>
              <span className="font-mono">{formatNumber(Number(formatEther(zapPreview.ethLP)), 6)} ETH</span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("jpyc.expected_jpyc")}:</span>
              <span className="font-mono text-[#4A90E2] font-medium">
                {formatNumber(Number(formatUnits(zapPreview.predictedJPYC, 18)), 2)} JPYC
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">{t("jpyc.jpyc_for_lp")}:</span>
              <span className="font-mono">{formatNumber(Number(formatUnits(zapPreview.jpycForLP, 18)), 2)} JPYC</span>
            </div>
          </div>

          <div className="pt-2 mt-2 border-t border-border text-xs text-muted-foreground">{t("jpyc.zap_note")}</div>
        </div>
      )}

      {/* Loading Preview */}
      {isLoadingPreview && ethAmount && parseFloat(ethAmount) > 0 && (
        <div className="bg-muted/30 border border-border rounded-lg p-4 flex items-center justify-center">
          <LoadingLogo className="h-6 w-6 text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">{t("common.loading")}</span>
        </div>
      )}

      {/* Error Display */}
      {txError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
          {txError}
        </div>
      )}

      {/* Success Display */}
      {isSuccess && txHash && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckIcon className="h-4 w-4" />
            <span>{t("common.transaction_successful")}</span>
          </div>
          <a
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#4A90E2] mt-2 transition-colors"
          >
            {t("common.view_on_etherscan")}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {/* Action Button */}
      {!isConnected ? (
        <ConnectMenu />
      ) : (
        <Button onClick={executeZap} disabled={isButtonDisabled} className="w-full" size="lg">
          {isPending || isConfirming ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {buttonText}
            </>
          ) : isSuccess ? (
            <>
              <CheckIcon className="mr-2 h-4 w-4" />
              {buttonText}
            </>
          ) : (
            buttonText
          )}
        </Button>
      )}

      {/* Info Section */}
      <div className="bg-muted/20 border border-border/50 rounded-lg p-3 space-y-2 text-xs text-muted-foreground">
        <div className="font-medium text-foreground">{t("jpyc.how_it_works")}</div>
        <ul className="space-y-1 list-disc list-inside">
          <li>{t("jpyc.zap_step_1")}</li>
          <li>{t("jpyc.zap_step_2")}</li>
          <li>{t("jpyc.zap_step_3")}</li>
          <li>{t("jpyc.zap_step_4")}</li>
        </ul>
        <div className="mt-2 pt-2 border-t border-border/30">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Default slippage is 5% due to low liquidity in JPYC pools. Increase to 10% if transactions fail.
          </p>
        </div>
      </div>
    </div>
  );
};
