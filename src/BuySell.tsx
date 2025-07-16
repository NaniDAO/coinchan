import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PercentageSlider } from "@/components/ui/percentage-slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleWalletError } from "@/lib/errors";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { LoadingLogo } from "./components/ui/loading-logo";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { useReserves } from "./hooks/use-reserves";
import {
  DEADLINE_SEC,
  SWAP_FEE,
  type ZAMMPoolKey,
  computePoolId,
  computePoolKey,
  getAmountOut,
  getAmountIn,
  withSlippage,
} from "./lib/swap";
import { nowSec } from "./lib/utils";

export const BuySell = ({
  tokenId,
  name,
  symbol,
}: {
  tokenId: bigint;
  name: string;
  symbol: string;
}) => {
  const [tab, setTab] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [swapFee, setSwapFee] = useState<bigint>(SWAP_FEE);
  const [buyPercentage, setBuyPercentage] = useState(0);
  const [exactMode, setExactMode] = useState<"input" | "output">("input");

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Fetch the lockup info to determine the custom swap fee and owner
  useEffect(() => {
    if (!publicClient || !tokenId) return;

    let isMounted = true;

    const fetchLockupInfo = async () => {
      try {
        const lockup = (await publicClient.readContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "lockups",
          args: [tokenId],
        })) as readonly [string, number, number, boolean, bigint, bigint];

        if (!isMounted) return;

        const [, , , , , lockupSwapFee] = lockup;

        const customSwapFee = lockupSwapFee && lockupSwapFee > 0n ? lockupSwapFee : SWAP_FEE;
        setSwapFee(customSwapFee);
      } catch (err) {
        console.error(`BuySell: Failed to fetch lockup info for token ${tokenId.toString()}:`, err);
        if (isMounted) {
          setSwapFee(SWAP_FEE);
        }
      }
    };

    fetchLockupInfo();

    return () => {
      isMounted = false;
    };
  }, [publicClient, tokenId, address]);

  const { data: balance } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "balanceOf",
    args: address ? [address, tokenId] : undefined,
    chainId: mainnet.id,
  });

  const { data: ethBalance } = useBalance({
    address: address,
    chainId: mainnet.id,
  });

  const { data: isOperator } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, ZAMMAddress] : undefined,
    chainId: mainnet.id,
  });

  const { data: reserves } = useReserves({
    poolId: computePoolId(tokenId, swapFee, CoinsAddress),
    source: "ZAMM",
  });

  const estimated = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return "0";
    try {
      if (tab === "buy") {
        if (exactMode === "input") {
          // Input: ETH amount -> Output: token amount
          const inWei = parseEther(amount || "0");
          const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, swapFee);
          const minOut = withSlippage(rawOut);
          return formatUnits(minOut, 18);
        } else {
          // Input: token amount -> Output: ETH amount needed
          const outUnits = parseUnits(amount || "0", 18);
          const rawIn = getAmountIn(outUnits, reserves.reserve0, reserves.reserve1, swapFee);
          const maxIn = rawIn + (rawIn * 200n) / 10000n; // 2% buffer
          return formatEther(maxIn);
        }
      } else {
        if (exactMode === "input") {
          // Input: token amount -> Output: ETH amount
          const inUnits = parseUnits(amount || "0", 18);
          const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, swapFee);
          const minOut = withSlippage(rawOut);
          return formatEther(minOut);
        } else {
          // Input: ETH amount -> Output: token amount needed
          const outWei = parseEther(amount || "0");
          const rawIn = getAmountIn(outWei, reserves.reserve1, reserves.reserve0, swapFee);
          const maxIn = rawIn + (rawIn * 200n) / 10000n; // 2% buffer
          return formatUnits(maxIn, 18);
        }
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab, swapFee, exactMode]);

  const handleBuyPercentageChange = useCallback(
    (percentage: number) => {
      setBuyPercentage(percentage);

      if (!ethBalance?.value) return;

      const adjustedBalance =
        percentage === 100 ? (ethBalance.value * 99n) / 100n : (ethBalance.value * BigInt(percentage)) / 100n;

      const newAmount = formatEther(adjustedBalance);
      setAmount(newAmount);
    },
    [ethBalance?.value],
  );

  useEffect(() => {
    if (tab !== "buy" || !ethBalance?.value || !amount) {
      setBuyPercentage(0);
      return;
    }

    try {
      const amountWei = parseEther(amount);
      if (ethBalance.value > 0n) {
        const calculatedPercentage = Number((amountWei * 100n) / ethBalance.value);
        setBuyPercentage(Math.min(100, Math.max(0, calculatedPercentage)));
      }
    } catch {
      setBuyPercentage(0);
    }
  }, [amount, ethBalance?.value, tab]);

  const onBuy = async () => {
    if (!reserves || !address) return;

    setErrorMessage(null);

    try {
      if (chainId !== mainnet.id) {
        switchChain({ chainId: mainnet.id });
      }

      const poolKey = computePoolKey(tokenId, swapFee, CoinsAddress) as ZAMMPoolKey;
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      if (exactMode === "input") {
        // swapExactIn: user specifies exact ETH input
        const amountInWei = parseEther(amount || "0");
        const rawOut = getAmountOut(amountInWei, reserves.reserve0, reserves.reserve1, swapFee);
        const amountOutMin = withSlippage(rawOut);

        const hash = await writeContractAsync({
          address: ZAMMAddress,
          abi: ZAMMAbi,
          functionName: "swapExactIn",
          args: [poolKey, amountInWei, amountOutMin, true, address, deadline],
          value: amountInWei,
          chainId: mainnet.id,
        });
        setTxHash(hash);
      } else {
        // swapExactOut: user specifies exact token output
        const amountOutTokens = parseUnits(amount || "0", 18);
        const rawIn = getAmountIn(amountOutTokens, reserves.reserve0, reserves.reserve1, swapFee);
        const amountInMax = rawIn + (rawIn * 200n) / 10000n; // 2% slippage buffer

        const hash = await writeContractAsync({
          address: ZAMMAddress,
          abi: ZAMMAbi,
          functionName: "swapExactOut",
          args: [poolKey, amountOutTokens, amountInMax, true, address, deadline],
          value: amountInMax,
          chainId: mainnet.id,
        });
        setTxHash(hash);
      }
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  const onSell = async () => {
    if (!reserves || !address) return;

    setErrorMessage(null);

    try {
      if (chainId !== mainnet.id) {
        await switchChain({ chainId: mainnet.id });
      }

      if (!isOperator) {
        try {
          await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [ZAMMAddress, true],
            chainId: mainnet.id,
          });
        } catch (approvalErr) {
          const errorMsg = handleWalletError(approvalErr);
          if (errorMsg) {
            setErrorMessage(errorMsg);
          }
          return;
        }
      }

      const poolKey = computePoolKey(tokenId, swapFee, CoinsAddress) as ZAMMPoolKey;
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      if (exactMode === "input") {
        // swapExactIn: user specifies exact token input
        const amountInUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(amountInUnits, reserves.reserve1, reserves.reserve0, swapFee);
        const amountOutMin = withSlippage(rawOut);

        const hash = await writeContractAsync({
          address: ZAMMAddress,
          abi: ZAMMAbi,
          functionName: "swapExactIn",
          args: [poolKey, amountInUnits, amountOutMin, false, address, deadline],
          chainId: mainnet.id,
        });
        setTxHash(hash);
      } else {
        // swapExactOut: user specifies exact ETH output
        const amountOutWei = parseEther(amount || "0");
        const rawIn = getAmountIn(amountOutWei, reserves.reserve1, reserves.reserve0, swapFee);
        const amountInMax = rawIn + (rawIn * 200n) / 10000n; // 2% slippage buffer

        const hash = await writeContractAsync({
          address: ZAMMAddress,
          abi: ZAMMAbi,
          functionName: "swapExactOut",
          args: [poolKey, amountOutWei, amountInMax, false, address, deadline],
          chainId: mainnet.id,
        });
        setTxHash(hash);
      }
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell")}>
      <TabsList>
        <TabsTrigger value="buy" className="transition-all duration-300">
          Buy {name} [{symbol}]
        </TabsTrigger>
        <TabsTrigger value="sell" className="transition-all duration-300">
          Sell {name} [{symbol}]
        </TabsTrigger>
      </TabsList>

      {/* Exact mode toggle */}
      <div className="mt-3 p-3 bg-background/50 rounded-lg border border-primary/20">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Swap Mode</span>
          <div className="inline-flex gap-1 border border-border bg-muted p-0.5">
            <button
              onClick={() => setExactMode("input")}
              className={`px-2 py-1 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 ${
                exactMode === "input"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Exact In
            </button>
            <button
              onClick={() => setExactMode("output")}
              className={`px-2 py-1 text-xs font-bold uppercase cursor-pointer transition-all duration-100 font-body hover:opacity-80 ${
                exactMode === "output"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              Exact Out
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {exactMode === "input"
            ? tab === "buy"
              ? "Specify exact ETH amount to spend"
              : "Specify exact token amount to sell"
            : tab === "buy"
              ? "Specify exact token amount to receive"
              : "Specify exact ETH amount to receive"}
        </p>
      </div>

      <TabsContent value="buy" className="max-w-2xl">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-green-700">
            {exactMode === "input" ? "Using ETH" : `Target ${symbol}`}
          </span>
          <Input
            type="number"
            placeholder={exactMode === "input" ? "Amount ETH" : `Amount ${symbol}`}
            value={amount}
            min="0"
            step="any"
            onChange={(e) => setAmount(e.currentTarget.value)}
            disabled={false}
          />

          {ethBalance?.value && ethBalance.value > 0n && isConnected && exactMode === "input" ? (
            <div className="mt-2 pt-2 border-t border-primary/20">
              <PercentageSlider value={buyPercentage} onChange={handleBuyPercentageChange} />
            </div>
          ) : null}

          <span className="text-sm font-medium text-green-800">
            {exactMode === "input" 
              ? `You will receive ~ ${estimated} ${symbol}` 
              : `You will pay ~ ${estimated} ETH`}
          </span>
          <Button
            onClick={onBuy}
            disabled={!isConnected || isPending || !amount}
            variant="default"
            className={`bg-green-600 hover:bg-green-700 text-white font-bold transition-opacity duration-300`}
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <LoadingLogo size="sm" className="scale-75" />
                Buying…
              </span>
            ) : (
              `Buy ${symbol}`
            )}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="sell" className="max-w-2xl">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-accent dark:text-accent">
            {exactMode === "input" ? `Using ${symbol}` : "Target ETH"}
          </span>
          <div className="relative">
            <Input
              type="number"
              placeholder={exactMode === "input" ? `Amount ${symbol}` : "Amount ETH"}
              value={amount}
              min="0"
              step="any"
              onChange={(e) => setAmount(e.currentTarget.value)}
              disabled={false}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {exactMode === "input" 
                ? `You will receive ~ ${estimated} ETH` 
                : `You will pay ~ ${estimated} ${symbol}`}
            </span>
            {balance !== undefined ? (
              <button
                className="self-end text-sm font-medium text-chart-2 dark:text-chart-2 hover:text-primary transition-colors"
                onClick={() => {
                  if (exactMode === "input") {
                    // Input mode: set max tokens to sell
                    setAmount(formatUnits(balance, 18));
                  } else if (exactMode === "output" && reserves) {
                    // Output mode: set max ETH we can get for all tokens
                    try {
                      const maxEth = getAmountOut(balance, reserves.reserve1, reserves.reserve0, swapFee);
                      setAmount(formatEther(maxEth));
                    } catch {
                      // Fallback to setting token amount
                      setAmount(formatUnits(balance, 18));
                    }
                  }
                }}
                disabled={false}
              >
                MAX ({formatUnits(balance, 18)})
              </button>
            ) : (
              <button className="self-end text-sm font-medium text-chart-2 dark:text-chart-2" disabled={!balance}>
                MAX
              </button>
            )}
          </div>
          <Button
            onClick={onSell}
            disabled={!isConnected || isPending || !amount}
            variant="outline"
            className={`dark:border-accent dark:text-accent dark:hover:bg-accent/10 transition-opacity duration-300 `}
          >
            {isPending ? (
              <span className="flex items-center gap-2">
                <LoadingLogo size="sm" className="scale-75" />
                Selling…
              </span>
            ) : (
              `Sell ${symbol}`
            )}
          </Button>
        </div>
      </TabsContent>

      {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
      {isSuccess && <p className="text-chart-2 text-sm">Tx confirmed!</p>}
    </Tabs>
  );
};
