import { useState, useMemo, useEffect, useCallback, useRef } from "react";
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
import { formatNumber, nowSec } from "./lib/utils";
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
import { formatImageURL, getAlternativeImageUrls } from "./hooks/metadata/coin-utils";
import { computePoolKey, DEADLINE_SEC, getAmountOut, SWAP_FEE, withSlippage } from "./lib/swap";
import { CheckTheChainAbi, CheckTheChainAddress } from "./constants/CheckTheChain";

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
  const description = coinData ? coinData.description : "No description available";

  // Fetch the lockup info to determine the custom swap fee and owner
  useEffect(() => {
    if (!publicClient || !tokenId) return; // Removed address dependency so this works even when not connected

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

        // Extract values based on the Lockup struct layout: [owner, creation, unlock, vesting, swapFee, claimed]
        const [lockupOwner, , , , lockupSwapFee] = lockup;

        // Set the swap fee from lockup or use default if not available or zero
        const customSwapFee = lockupSwapFee && lockupSwapFee > 0n ? lockupSwapFee : SWAP_FEE;
        setSwapFee(customSwapFee);

        // Check if the current address is the owner (only if address is connected)
        if (address) {
          const isActualOwner = lockupOwner?.toLowerCase() === address.toLowerCase();
          setIsOwner(isActualOwner);
        }
      } catch (err) {
        console.error(`BuySell: Failed to fetch lockup info for token ${tokenId.toString()}:`, err);
        // Use default swap fee if there's an error, but only if we haven't already set a custom fee
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
  }, [publicClient, tokenId, address]); // Keep address dependency for owner check

  // We already have reserves in the coinData, no need for a separate fetch
  const reserves = coinData
    ? {
        reserve0: coinData.reserve0,
        reserve1: coinData.reserve1,
      }
    : null;

  // Fetch ETH price in USD from CheckTheChain
  const { data: ethPriceData } = useReadContract({
    address: CheckTheChainAddress,
    abi: CheckTheChainAbi,
    functionName: "checkPrice",
    args: ["WETH"],
    chainId: mainnet.id,
    query: {
      // Refresh every 60 seconds
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

  // Fetch ETH balance for percentage slider
  const { data: ethBalance } = useBalance({
    address: address,
    chainId: mainnet.id,
  });

  // fetch allowance / operator state
  const { data: isOperator } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, ZAMMAddress] : undefined,
    chainId: mainnet.id,
  });

  // calculate the slippage‐adjusted estimate shown in the UI
  const estimated = useMemo(() => {
    if (!reserves || !reserves.reserve0 || !reserves.reserve1) return "0";
    try {
      if (tab === "buy") {
        const inWei = parseEther(amount || "0");
        const rawOut = getAmountOut(inWei, reserves.reserve0, reserves.reserve1, swapFee);
        const minOut = withSlippage(rawOut);
        return formatUnits(minOut, 18);
      } else {
        const inUnits = parseUnits(amount || "0", 18);
        const rawOut = getAmountOut(inUnits, reserves.reserve1, reserves.reserve0, swapFee);
        const minOut = withSlippage(rawOut);
        return formatEther(minOut);
      }
    } catch {
      return "0";
    }
  }, [amount, reserves, tab, swapFee]);

  // Handle percentage slider change for buy tab
  const handleBuyPercentageChange = useCallback(
    (percentage: number) => {
      setBuyPercentage(percentage);

      if (!ethBalance?.value) return;

      // Apply gas discount for 100% (1% discount)
      const adjustedBalance =
        percentage === 100 ? (ethBalance.value * 99n) / 100n : (ethBalance.value * BigInt(percentage)) / 100n;

      const newAmount = formatEther(adjustedBalance);
      setAmount(newAmount);
    },
    [ethBalance?.value],
  );

  // Update percentage when amount changes manually
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

  // BUY using ETH → token
  const onBuy = async () => {
    if (!reserves || !address) return;

    // Clear any previous error message when starting a new transaction
    setErrorMessage(null);

    try {
      // Switch to mainnet if needed
      if (chainId !== mainnet.id) {
        await switchChain({ chainId: mainnet.id });
      }

      const amountInWei = parseEther(amount || "0");
      const rawOut = getAmountOut(amountInWei, reserves.reserve0, reserves.reserve1, swapFee);
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(tokenId, swapFee);
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
      // Use our utility to handle the error - only set error message for non-rejection errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  // SELL using token → ETH
  const onSell = async () => {
    if (!reserves || !address) return;

    // Clear any previous error message when starting a new transaction
    setErrorMessage(null);

    try {
      // Switch to mainnet if needed
      if (chainId !== mainnet.id) {
        await switchChain({ chainId: mainnet.id });
      }

      const amountInUnits = parseUnits(amount || "0", 18);

      // ensure approval
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
          // Handle approval error separately
          const errorMsg = handleWalletError(approvalErr);
          if (errorMsg) {
            setErrorMessage(errorMsg);
          }
          // Exit early if there was an approval error
          return;
        }
      }

      const rawOut = getAmountOut(amountInUnits, reserves.reserve1, reserves.reserve0, swapFee);
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(tokenId, swapFee);
      const hash = await writeContractAsync({
        address: ZAMMAddress,
        abi: ZAMMAbi,
        functionName: "swapExactIn",
        args: [poolKey, amountInUnits, amountOutMin, false, address, deadline],
        chainId: mainnet.id,
      });
      setTxHash(hash);
    } catch (err) {
      // Use our utility to handle the error - only set error message for non-rejection errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        setErrorMessage(errorMsg);
      }
    }
  };

  // Calculate market cap in USD
  const marketCapUsd = useMemo(() => {
    if (!coinData || !ethPriceData) return null;

    // Using the string representation as it's likely already in the correct format
    const priceStr = ethPriceData[1];
    const ethPriceUsd = parseFloat(priceStr);

    // Check if the parsing was successful
    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;
    if (coinData.marketCapEth === undefined) return null;

    // Market cap in USD = market cap in ETH * ETH price in USD
    return coinData.marketCapEth * ethPriceUsd;
  }, [coinData, ethPriceData]);

  // Use the display name and symbol
  const displayName = name || propName;
  const displaySymbol = symbol || propSymbol;

  // State for tracking image loading and errors
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const alternativeUrlsRef = useRef<string[]>([]);
  const attemptedUrlsRef = useRef<Set<string>>(new Set());

  // Determine the best image URL to use
  useEffect(() => {
    if (!coinData) return;

    let imageUrl = null;
    let imageSourceForAlternatives = "";
    setImageLoaded(false);
    setImageError(false);
    attemptedUrlsRef.current = new Set();

    // Try different sources in order of preference
    if (coinData.imageUrl) {
      imageUrl = coinData.imageUrl;
      imageSourceForAlternatives = coinData.imageUrl;
    } else if (coinData.metadata?.image) {
      imageUrl = formatImageURL(coinData.metadata.image);
      imageSourceForAlternatives = coinData.metadata.image;
    } else if (coinData.metadata?.image_url) {
      imageUrl = formatImageURL(coinData.metadata.image_url);
      imageSourceForAlternatives = coinData.metadata.image_url;
    } else if (coinData.metadata?.imageUrl) {
      imageUrl = formatImageURL(coinData.metadata.imageUrl);
      imageSourceForAlternatives = coinData.metadata.imageUrl;
    }

    // Generate alternative URLs for fallback
    if (imageSourceForAlternatives) {
      alternativeUrlsRef.current = getAlternativeImageUrls(imageSourceForAlternatives);
    } else {
      alternativeUrlsRef.current = [];
    }

    setCurrentImageUrl(imageUrl);
    if (imageUrl) {
      attemptedUrlsRef.current.add(imageUrl);
    }
  }, [coinData]);

  // Handle image load error with fallback attempt
  const handleImageError = useCallback(() => {
    console.error(`Image failed to load for coin ${tokenId.toString()}`);

    // Try next alternative URL if available
    if (alternativeUrlsRef.current.length > 0) {
      // Find the first URL we haven't tried yet
      const nextUrl = alternativeUrlsRef.current.find((url) => !attemptedUrlsRef.current.has(url));

      if (nextUrl) {
        attemptedUrlsRef.current.add(nextUrl);
        setCurrentImageUrl(nextUrl);
        // Don't set error yet, we're trying an alternative
        return;
      }
    }

    // If we've exhausted all alternatives, mark as error
    setImageError(true);
  }, [tokenId]);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "buy" | "sell")}>
      <div
        className={`flex items-start gap-4 mb-4 p-4 border-muted border-2 bg-muted/10 text-muted-foreground rounded-lg content-transition ${isLoading ? "loading" : "loaded fadeIn"}`}
      >
        <div className="flex-shrink-0">
          <div className="w-16 h-16 relative">
            {/* Base colored circle (always visible) */}
            <div
              className={`w-full h-full flex bg-destructive text-background justify-center items-center rounded-full ${isLoading ? "animate-pulse" : ""}`}
            >
              {isLoading ? "..." : displaySymbol?.slice(0, 3)}
            </div>

            {/* Use enhanced image loading with fallbacks */}
            {!isLoading && !imageError && currentImageUrl && (
              <img
                src={currentImageUrl}
                alt={`${displaySymbol} logo`}
                className={`absolute inset-0 w-full h-full rounded-full object-cover transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                style={{ zIndex: 1 }}
                onLoad={() => setImageLoaded(true)}
                onError={handleImageError}
                loading="lazy"
              />
            )}
          </div>
        </div>
        <div className="flex flex-col flex-grow overflow-hidden">
          <div className="flex items-baseline space-x-2">
            {isLoading ? (
              <>
                <div className="h-6 bg-muted/50 rounded w-32 skeleton"></div>
                <div className="h-4 bg-muted/50 rounded w-14 skeleton"></div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium truncate content-transition loaded">{displayName}</h3>
                <span className="text-sm font-medium text-accent dark:text-accent content-transition loaded">
                  [{displaySymbol}]
                </span>
              </>
            )}
          </div>

          {/* Token ID in hex format and Etherscan link */}
          <div className="flex items-center mt-1 text-xs">
            <span className="font-medium text-secondary dark:text-chart-2 mr-1">
              ID: {tokenId.toString()} (0x{tokenId.toString(16)})
            </span>
            <a
              href={`https://etherscan.io/token/0x${tokenId.toString(16)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-2"
            >
              View on Etherscan
            </a>
          </div>

          {/* Description */}
          {isLoading ? (
            <div className="mt-1 space-y-1">
              <div className="h-3 bg-muted/30 rounded w-full skeleton"></div>
              <div className="h-3 bg-muted/30 rounded w-3/4 skeleton"></div>
              <div className="h-3 bg-muted/30 rounded w-5/6 skeleton"></div>
            </div>
          ) : (
            <p className="text-sm font-medium description-text mt-1 overflow-y-auto max-h-20 content-transition loaded">
              {description || "No description available"}
            </p>
          )}

          {/* Market Cap Estimation and Swap Fee */}
          <div className="mt-2 text-xs">
            <div className="flex flex-col gap-1">
              {/* Always show the swap fee, independent of market cap calculation */}
              <div className="flex items-center gap-1">
                <span className="font-medium dark:text-chart-2">Swap Fee:</span>
                {isLoading ? (
                  <div className="h-3 bg-muted/40 rounded w-10 skeleton"></div>
                ) : (
                  <span className="font-medium text-primary transition-opacity duration-300">
                    {(Number(swapFee) / 100).toFixed(2)}%
                  </span>
                )}
                {!isLoading && isOwner && <span className="text-xs text-chart-2">(You are the owner)</span>}
              </div>

              {/* Market Cap section */}
              {isLoading ? (
                <div className="flex items-center gap-1">
                  <span className="font-medium market-cap-text">Est. Market Cap:</span>
                  <div className="h-3 bg-muted/40 rounded w-24 skeleton"></div>
                </div>
              ) : (
                coinData?.marketCapEth !== null && (
                  <div className="flex items-center gap-1 transition-opacity duration-300">
                    <span className="font-medium market-cap-text">Est. Market Cap:</span>
                    <span className="market-cap-text">
                      {coinData?.marketCapEth ? formatNumber(coinData?.marketCapEth, 2) : "N/A"} ETH
                    </span>
                    {marketCapUsd !== null ? (
                      <span className="ml-1 market-cap-text">(~${formatNumber(marketCapUsd, 0)})</span>
                    ) : ethPriceData ? (
                      <span className="ml-1 market-cap-text">(USD price processing...)</span>
                    ) : (
                      <span className="ml-1 market-cap-text">(ETH price unavailable)</span>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Token URI link if available */}
            {!isLoading && coinData?.tokenURI && coinData.tokenURI !== "N/A" && (
              <div className="mt-1">
                <a
                  href={
                    coinData.tokenURI.startsWith("ipfs://")
                      ? `https://content.wrappr.wtf/ipfs/${coinData.tokenURI.slice(7)}`
                      : coinData.tokenURI
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  View Token Metadata
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

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

          {/* Percentage slider for ETH balance */}
          {ethBalance?.value && ethBalance.value > 0n && isConnected ? (
            <div className="mt-2 pt-2 border-t border-primary/20">
              <PercentageSlider value={buyPercentage} onChange={handleBuyPercentageChange} disabled={isLoading} />
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
            {isPending ? "Buying…" : isLoading ? "Loading..." : `Buy ${displaySymbol}`}
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
            <span className="text-sm font-medium">You will receive ~ {estimated} ETH</span>
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
            {isPending ? "Selling…" : isLoading ? "Loading..." : `Sell ${displaySymbol}`}
          </Button>
        </div>
      </TabsContent>

      {errorMessage && <p className="text-destructive text-sm">{errorMessage}</p>}
      {isSuccess && <p className="text-chart-2 text-sm">Tx confirmed!</p>}
    </Tabs>
  );
};
