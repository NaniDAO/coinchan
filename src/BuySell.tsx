import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSwitchChain,
  useChainId,
  usePublicClient,
  useBalance,
} from "wagmi";

// Add global styles
import "./buysell-styles.css";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";
import { nowSec } from "./lib/utils";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PercentageSlider } from "@/components/ui/percentage-slider";
import { mainnet } from "viem/chains";
import { handleWalletError } from "@/lib/errors";
import { useCoinData } from "./hooks/metadata";
import { formatImageURL } from "./hooks/metadata/coin-utils";
import {
  computePoolKey,
  DEADLINE_SEC,
  getAmountOut,
  SWAP_FEE,
  withSlippage,
  ZAMMPoolKey,
} from "./lib/swap";
import {
  CheckTheChainAbi,
  CheckTheChainAddress,
} from "./constants/CheckTheChain";
import { CoinInfoCard } from "./components/CoinInfoCard";

export const BuySell = ({
  tokenId,
  name: propName,
  symbol: propSymbol,
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
  const [isOwner, setIsOwner] = useState(false);
  const [buyPercentage, setBuyPercentage] = useState(0);

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Fetch coin data using our new hook
  const { data: coinData, isLoading } = useCoinData(tokenId);

  const name = coinData ? coinData.name : "Token";
  const symbol = coinData ? coinData.symbol : "TKN";
  const description = coinData
    ? coinData.description
    : "No description available";

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

        const [lockupOwner, , , , lockupSwapFee] = lockup;

        const customSwapFee =
          lockupSwapFee && lockupSwapFee > 0n ? lockupSwapFee : SWAP_FEE;
        setSwapFee(customSwapFee);

        if (address) {
          const isActualOwner =
            lockupOwner?.toLowerCase() === address.toLowerCase();
          setIsOwner(isActualOwner);
        }
      } catch (err) {
        console.error(
          `BuySell: Failed to fetch lockup info for token ${tokenId.toString()}:`,
          err,
        );
        if (isMounted) {
          setSwapFee(SWAP_FEE);
          setIsOwner(false);
        }
      }
    };

    fetchLockupInfo();

    return () => {
      isMounted = false;
    };
  }, [publicClient, tokenId, address]);

  const reserves = coinData
    ? {
        reserve0: coinData.reserve0,
        reserve1: coinData.reserve1,
      }
    : null;

  const { data: ethPriceData } = useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: ["WETH"],
    chainId: mainnet.id,
    query: {
      staleTime: 60_000,
    },
  });

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

  const estimated = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return "0";
    try {
      if (tab === "buy") {
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(
          inWei,
          reserves.reserve0,
          reserves.reserve1,
          swapFee,
        );
        const minOut = withSlippage(rawOut);
        return formatUnits(minOut, 18);
      } else {
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(
          inUnits,
          reserves.reserve1,
          reserves.reserve0,
          swapFee,
        );
        const minOut = withSlippage(rawOut);
        return formatEther(minOut);
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab, swapFee]);

  const handleBuyPercentageChange = useCallback(
    (percentage: number) => {
      setBuyPercentage(percentage);

      if (!ethBalance?.value) return;

      const adjustedBalance =
        percentage === 100
          ? (ethBalance.value * 99n) / 100n
          : (ethBalance.value * BigInt(percentage)) / 100n;

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
        const calculatedPercentage = Number(
          (amountWei * 100n) / ethBalance.value,
        );
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
        await switchChain({ chainId: mainnet.id });
      }

      const amountInWei = parseEther(amount || "0");
      const rawOut = getAmountOut(
        amountInWei,
        reserves.reserve0,
        reserves.reserve1,
        swapFee,
      );
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(
        tokenId,
        swapFee,
        CoinsAddress,
      ) as ZAMMPoolKey;
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [poolKey, amountInWei, amountOutMin, true, address, deadline],
        value: amountInWei,
        chainId: mainnet.id,
      });
      setTxHash(hash);
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

      const amountInUnits = parseUnits(amount || "0", 18);

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

      const rawOut = getAmountOut(
        amountInUnits,
        reserves.reserve1,
        reserves.reserve0,
        swapFee,
      );
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(
        tokenId,
        swapFee,
        CoinsAddress,
      ) as ZAMMPoolKey;
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [poolKey, amountInUnits, amountOutMin, false, address, deadline],
        chainId: mainnet.id,
      });
      setTxHash(hash);
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  const marketCapUsd = useMemo(() => {
    if (!coinData || !ethPriceData) return null;

    const priceStr = ethPriceData[1];
    const ethPriceUsd = parseFloat(priceStr);

    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;
    if (coinData.marketCapEth === undefined) return null;

    return coinData.marketCapEth * ethPriceUsd;
  }, [coinData, ethPriceData]);

  const displayName = name || propName;
  const displaySymbol = symbol || propSymbol;

  const imageUrl =
    coinData?.imageUrl ||
    (coinData?.metadata?.image && formatImageURL(coinData.metadata.image)) ||
    (coinData?.metadata?.image_url &&
      formatImageURL(coinData.metadata.image_url)) ||
    (coinData?.metadata?.imageUrl &&
      formatImageURL(coinData.metadata.imageUrl)) ||
    "";

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell")}>
      <CoinInfoCard
        coinId={tokenId}
        name={displayName}
        symbol={displaySymbol}
        description={description || "No description available"}
        imageUrl={imageUrl}
        swapFee={Number(swapFee)}
        isOwner={isOwner}
        type={"ZAMM"}
        marketCapEth={coinData?.marketCapEth ?? 0}
        marketCapUsd={marketCapUsd ?? 0}
        isEthPriceData={ethPriceData !== undefined}
        tokenURI={coinData?.tokenURI ?? ""}
        isLoading={isLoading}
      />

      <TabsList>
        <TabsTrigger value="buy" className="transition-all duration-300">
          Buy {isLoading ? "..." : `${displayName} [${displaySymbol}]`}
        </TabsTrigger>
        <TabsTrigger value="sell" className="transition-all duration-300">
          Sell {isLoading ? "..." : `${displayName} [${displaySymbol}]`}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="buy">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-green-700">Using ETH</span>
          <Input
            type="number"
            placeholder="Amount ETH"
            value={amount}
            min="0"
            step="any"
            onChange={(e) => setAmount(e.currentTarget.value)}
            disabled={isLoading}
            className={isLoading ? "opacity-70" : ""}
          />

          {ethBalance?.value && ethBalance.value > 0n && isConnected ? (
            <div className="mt-2 pt-2 border-t border-primary/20">
              <PercentageSlider
                value={buyPercentage}
                onChange={handleBuyPercentageChange}
                disabled={isLoading}
              />
            </div>
          ) : null}

          <span className="text-sm font-medium text-green-800">
            You will receive ~ {estimated} {isLoading ? "..." : displaySymbol}
          </span>
          <Button
            onClick={onBuy}
            disabled={!isConnected || isPending || !amount || isLoading}
            variant="default"
            className={`bg-green-600 hover:bg-green-700 text-white font-bold transition-opacity duration-300 ${isLoading ? "opacity-70" : ""}`}
          >
            {isPending
              ? "Buying…"
              : isLoading
                ? "Loading..."
                : `Buy ${displaySymbol}`}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="sell">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-accent dark:text-accent">
            Using {isLoading ? "..." : displaySymbol}
          </span>
          <div className="relative">
            <Input
              type="number"
              placeholder={`Amount ${isLoading ? "..." : displaySymbol}`}
              value={amount}
              min="0"
              step="any"
              onChange={(e) => setAmount(e.currentTarget.value)}
              disabled={isLoading}
              className={isLoading ? "opacity-70" : ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              You will receive ~ {estimated} ETH
            </span>
            {!isLoading && balance !== undefined ? (
              <button
                className="self-end text-sm font-medium text-chart-2 dark:text-chart-2 hover:text-primary transition-colors"
                onClick={() => setAmount(formatUnits(balance, 18))}
                disabled={isLoading}
              >
                MAX ({formatUnits(balance, 18)})
              </button>
            ) : (
              <button
                className="self-end text-sm font-medium text-chart-2 dark:text-chart-2"
                disabled={!balance || isLoading}
              >
                MAX
              </button>
            )}
          </div>
          <Button
            onClick={onSell}
            disabled={!isConnected || isPending || !amount || isLoading}
            variant="outline"
            className={`dark:border-accent dark:text-accent dark:hover:bg-accent/10 transition-opacity duration-300 ${isLoading ? "opacity-70" : ""}`}
          >
            {isPending
              ? "Selling…"
              : isLoading
                ? "Loading..."
                : `Sell ${displaySymbol}`}
          </Button>
        </div>
      </TabsContent>

      {errorMessage && (
        <p className="text-destructive text-sm">{errorMessage}</p>
      )}
      {isSuccess && <p className="text-chart-2 text-sm">Tx confirmed!</p>}
    </Tabs>
  );
};
