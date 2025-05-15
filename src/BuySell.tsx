import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSwitchChain,
  useChainId,
  usePublicClient,
} from "wagmi";
import {
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  zeroAddress,
} from "viem";
import { formatNumber } from "./lib/utils";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { mainnet } from "viem/chains";
import { handleWalletError } from "./utils";
import { useCoinData } from "./hooks/metadata";
import {
  formatImageURL,
  getAlternativeImageUrls,
} from "./hooks/metadata/coin-utils";

// CheckTheChain contract ABI for fetching ETH price
const CheckTheChainAbi = [
  {
    inputs: [{ internalType: "string", name: "symbol", type: "string" }],
    name: "checkPrice",
    outputs: [
      { internalType: "uint256", name: "price", type: "uint256" },
      { internalType: "string", name: "priceStr", type: "string" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

// CheckTheChain contract address
const CheckTheChainAddress = "0x0000000000cDC1F8d393415455E382c30FBc0a84";

const DEFAULT_SWAP_FEE = 100n; // 1% pool fee (default) - will be overridden by custom fee if available
const SLIPPAGE_BPS = 100n; // 100 basis points = 1 %
const DEADLINE_SEC = 20 * 60; // 20 minutes

// apply slippage tolerance to an amount
const withSlippage = (amount: bigint) =>
  (amount * (10000n - SLIPPAGE_BPS)) / 10000n;

type PoolKey = {
  id0: bigint;
  id1: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  swapFee: bigint;
};

const computePoolKey = (coinId: bigint, customSwapFee: bigint): PoolKey => ({
  id0: 0n,
  id1: coinId,
  token0: zeroAddress,
  token1: CoinsAddress,
  swapFee: customSwapFee,
});

// Unchanged getAmountOut from x*y invariants
const getAmountOut = (
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  const amountInWithFee = amountIn * (10000n - swapFee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  return numerator / denominator;
};

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
  const [swapFee, setSwapFee] = useState<bigint>(DEFAULT_SWAP_FEE);
  const [isOwner, setIsOwner] = useState(false);

  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const { switchChain } = useSwitchChain();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Fetch coin data using our new hook
  const { coinData, marketCapEth, getDisplayValues } = useCoinData(tokenId);

  // Get display values with fallbacks
  const { name, symbol, description } = getDisplayValues();

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
        const customSwapFee =
          lockupSwapFee && lockupSwapFee > 0n
            ? lockupSwapFee
            : DEFAULT_SWAP_FEE;
        setSwapFee(customSwapFee);

        // Check if the current address is the owner (only if address is connected)
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
        // Use default swap fee if there's an error, but only if we haven't already set a custom fee
        if (isMounted) {
          setSwapFee(DEFAULT_SWAP_FEE);
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

  // fetch allowance / operator state
  const { data: isOperator } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "isOperator",
    args: address ? [address, ZAAMAddress] : undefined,
    chainId: mainnet.id,
  });

  const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

  // calculate the slippage‐adjusted estimate shown in the UI
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
      const rawOut = getAmountOut(
        amountInWei,
        reserves.reserve0,
        reserves.reserve1,
        swapFee,
      );
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(tokenId, swapFee);
      const hash = await writeContractAsync({
        address: ZAAMAddress,
        abi: ZAAMAbi,
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
            args: [ZAAMAddress, true],
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

      const rawOut = getAmountOut(
        amountInUnits,
        reserves.reserve1,
        reserves.reserve0,
        swapFee,
      );
      const amountOutMin = withSlippage(rawOut);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      const poolKey = computePoolKey(tokenId, swapFee);
      const hash = await writeContractAsync({
        address: ZAAMAddress,
        abi: ZAAMAbi,
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
    if (!marketCapEth || !ethPriceData) return null;

    // Using the string representation as it's likely already in the correct format
    const priceStr = ethPriceData[1];
    const ethPriceUsd = parseFloat(priceStr);

    // Check if the parsing was successful
    if (isNaN(ethPriceUsd) || ethPriceUsd === 0) return null;

    // Market cap in USD = market cap in ETH * ETH price in USD
    return marketCapEth * ethPriceUsd;
  }, [marketCapEth, ethPriceData]);

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
      alternativeUrlsRef.current = getAlternativeImageUrls(
        imageSourceForAlternatives,
      );
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
      const nextUrl = alternativeUrlsRef.current.find(
        (url) => !attemptedUrlsRef.current.has(url),
      );

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
      <div className="flex items-start gap-4 mb-4 p-4 border-muted border-2 bg-muted/10 text-muted-foreground rounded-lg">
        <div className="flex-shrink-0">
          <div className="w-16 h-16 relative">
            {/* Base colored circle (always visible) */}
            <div
              className={`w-full h-full flex bg-destructive text-background justify-center items-center rounded-full`}
            >
              {displaySymbol?.slice(0, 3)}
            </div>

            {/* Use enhanced image loading with fallbacks */}
            {!imageError && currentImageUrl && (
              <img
                src={currentImageUrl}
                alt={`${displaySymbol} logo`}
                className={`absolute inset-0 w-full h-full rounded-full object-cover transition-opacity duration-200 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
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
            <h3 className="text-lg font-medium truncate">{displayName}</h3>
            <span className="text-sm text-muted-foreground">
              [{displaySymbol}]
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground mt-1 overflow-y-auto max-h-20">
            {description || "No description available"}
          </p>

          {/* Market Cap Estimation and Swap Fee */}
          <div className="mt-2 text-xs text-muted-foreground">
            <div className="flex flex-col gap-1">
              {/* Always show the swap fee, independent of market cap calculation */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Swap Fee:</span>
                {/* More precise conversion from basis points to percentage */}
                <span className="font-medium text-primary">
                  {(Number(swapFee) / 100).toFixed(2)}%
                </span>
                {isOwner && (
                  <span className="text-xs text-chart-2">
                    (You are the owner)
                  </span>
                )}
              </div>

              {/* Market Cap section */}
              {marketCapEth !== null && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">
                    Est. Market Cap:
                  </span>
                  <span>{formatNumber(marketCapEth, 2)} ETH</span>
                  {marketCapUsd !== null ? (
                    <span className="ml-1">
                      (~${formatNumber(marketCapUsd, 0)})
                    </span>
                  ) : ethPriceData ? (
                    <span className="ml-1 text-chart-5">
                      (USD price processing...)
                    </span>
                  ) : (
                    <span className="ml-1 text-chart-5">
                      (ETH price unavailable)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Token URI link if available */}
            {coinData?.tokenURI && coinData.tokenURI !== "N/A" && (
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
        <TabsTrigger value="buy">
          Buy {displayName} [{displaySymbol}]
        </TabsTrigger>
        <TabsTrigger value="sell">
          Sell {displayName} [{displaySymbol}]
        </TabsTrigger>
      </TabsList>

      <TabsContent value="buy">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">Using ETH</span>
          <Input
            type="number"
            placeholder="Amount ETH"
            value={amount}
            min="0"
            step="any"
            onChange={(e) => setAmount(e.currentTarget.value)}
          />
          <span className="text-sm">
            You will receive ~ {estimated} {displaySymbol}
          </span>
          <Button
            onClick={onBuy}
            disabled={!isConnected || isPending || !amount}
            variant="default"
            className="bg-chart-2 hover:bg-chart-2/80 text-background"
          >
            {isPending ? "Buying…" : `Buy ${displaySymbol}`}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="sell">
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">
            Using {displaySymbol}
          </span>
          <div className="relative">
            <Input
              type="number"
              placeholder={`Amount ${displaySymbol}`}
              value={amount}
              min="0"
              step="any"
              onChange={(e) => setAmount(e.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm">You will receive ~ {estimated} ETH</span>
            {balance !== undefined ? (
              <button
                className="self-end text-sm text-muted-foreground"
                onClick={() => setAmount(formatUnits(balance, 18))}
              >
                MAX ({formatUnits(balance, 18)})
              </button>
            ) : (
              <button
                className="self-end text-sm text-muted-foreground"
                disabled={!balance}
              >
                MAX
              </button>
            )}
          </div>
          <Button
            onClick={onSell}
            disabled={!isConnected || isPending || !amount}
            variant="outline"
            className=""
          >
            {isPending ? "Selling…" : `Sell ${displaySymbol}`}
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
