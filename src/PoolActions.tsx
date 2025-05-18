import { mainnet } from "viem/chains";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
  useChainId,
  useBalance,
} from "wagmi";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { parseEther, parseUnits, formatEther, formatUnits } from "viem";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { ZAMMHelperAbi, ZAMMHelperAddress } from "./constants/ZAMMHelper";
import {
  ZAMMSingleLiqETHAbi,
  ZAMMSingleLiqETHAddress,
} from "./constants/ZAMMSingleLiqETH";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowDownUp, Plus, Minus, CheckIcon } from "lucide-react";
import {
  estimateContractGas,
  simulateContractInteraction,
} from "./lib/simulate";
import PoolPriceChart from "./PoolPriceChart";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import {
  computePoolId,
  getAmountOut,
  getAmountIn,
  SWAP_FEE,
  withSlippage,
  computePoolKey,
  DEADLINE_SEC,
  SINGLE_ETH_SLIPPAGE_BPS,
  SLIPPAGE_BPS,
} from "./lib/swap";
import {
  ETH_TOKEN,
  TokenMeta,
  USDT_ADDRESS,
  USDT_POOL_ID,
  USDT_POOL_KEY,
} from "./lib/coins";
import { TokenSelector } from "./components/TokenSelector";
import { nowSec } from "./lib/utils";
import SpinnerLoader from "./components/ui/spinner-loader";
import { LiquidityActions } from "./LiquidityActions";
import { SwapAction } from "./SwapAction";

/* ────────────────────────────────────────────────────────────────────────────
  CONSTANTS & HELPERS
──────────────────────────────────────────────────────────────────────────── */
// Slippage options for the selector
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 50n },
  { label: "1%", value: 100n },
  { label: "2%", value: 200n },
  { label: "3%", value: 300n },
  { label: "5%", value: 500n },
];

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
  const {
    tokens,
    loading,
    error: loadError,
    isEthBalanceFetching,
    refetchEthBalance,
    tokenCount,
  } = useAllCoins();
  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);
  const [mode, setMode] = useState<TileMode>("swap");

  // Slippage settings with defaults
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(
    SINGLE_ETH_SLIPPAGE_BPS,
  );
  const [showSlippageSettings, setShowSlippageSettings] =
    useState<boolean>(false);

  // Single-ETH estimation values
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] =
    useState<string>("");

  // Track ETH balance separately to ensure it's always maintained correctly
  const [ethBalance, setEthBalance] = useState<bigint | undefined>(undefined);

  // When switching to single-eth mode, ensure ETH is selected as the sell token
  // and set a default target token if none is selected
  useEffect(() => {
    if (mode === "liquidity" && liquidityMode === "single-eth") {
      // If current sell token is not ETH, set it to ETH
      if (sellToken.id !== null) {
        // Find ETH token in tokens list
        const ethToken = tokens.find((t) => t.id === null);

        if (ethToken) {
          // Create a new ETH token but ensure it has the correct balance
          // Use our tracked ethBalance instead of potentially incorrect token.balance
          const safeEthToken = {
            ...ethToken,
            balance: ethBalance !== undefined ? ethBalance : ethToken.balance,
          };

          // Set the sell token to ETH with the safe balance
          setSellToken(safeEthToken);
        }
      } else if (
        sellToken.id === null &&
        ethBalance !== undefined &&
        sellToken.balance !== ethBalance
      ) {
        // If ETH is already selected but has wrong balance, update it
        setSellToken((prev) => ({
          ...prev,
          balance: ethBalance,
        }));
      }

      // If no target token is selected or it's ETH (but not a custom pool like USDT), set a default non-ETH token
      if (!buyToken || (buyToken.id === null && !buyToken.isCustomPool)) {
        // Find the first non-ETH token with the highest liquidity
        // Also include custom pools like USDT even if their ID is 0
        const defaultTarget = tokens.find(
          (token) => token.id !== null || token.isCustomPool,
        );
        if (defaultTarget) {
          setBuyToken(defaultTarget);
        }
      }
    }
  }, [mode, liquidityMode, tokens, sellToken, buyToken, ethBalance]);
  const [lpTokenBalance, setLpTokenBalance] = useState<bigint>(0n);
  const [lpBurnAmount, setLpBurnAmount] = useState<string>("");

  // Get wagmi hooks
  const { address, isConnected } = useAccount();

  // Get the public client for contract interactions
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Set initial buyToken once tokens are loaded
  useEffect(() => {
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  // Any additional setup can go here

  // Create a memoized version of tokens that doesn't change with every render
  const memoizedTokens = React.useMemo(() => tokens, [tokens]);

  // Also create a memoized version of non-ETH tokens to avoid conditional hook calls
  const memoizedNonEthTokens = React.useMemo(
    () => memoizedTokens.filter((token) => token.id !== null),
    [memoizedTokens],
  );

  // Define transaction-related state upfront to avoid reference errors
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  // Enhanced hook to keep ETH token state in sync with refresh-resistant behavior
  useEffect(() => {
    if (memoizedTokens.length === 0) return;

    const updatedEthToken = memoizedTokens.find((token) => token.id === null);
    if (!updatedEthToken) return;

    // Update sellToken if it's ETH, preserving balance whenever possible
    if (sellToken.id === null) {
      // Only update if the balance has changed from non-zero to different non-zero
      // or from zero/undefined to a real value
      const shouldUpdate =
        (updatedEthToken.balance &&
          updatedEthToken.balance > 0n &&
          (!sellToken.balance ||
            sellToken.balance === 0n ||
            updatedEthToken.balance !== sellToken.balance)) ||
        // Or if the updated token has no balance but we previously had one, keep the old one
        ((!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          sellToken.balance &&
          sellToken.balance > 0n);

      if (shouldUpdate) {
        // Update ETH token with balance changes

        // If the updated token has no balance but we already have one, merge them
        if (
          (!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          sellToken.balance &&
          sellToken.balance > 0n
        ) {
          setSellToken({
            ...updatedEthToken,
            balance: sellToken.balance,
          });
        } else {
          setSellToken(updatedEthToken);
        }
      }
    }

    // Update buyToken if it's ETH with similar logic
    if (buyToken && buyToken.id === null) {
      const shouldUpdate =
        (updatedEthToken.balance &&
          updatedEthToken.balance > 0n &&
          (!buyToken.balance ||
            buyToken.balance === 0n ||
            updatedEthToken.balance !== buyToken.balance)) ||
        ((!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          buyToken.balance &&
          buyToken.balance > 0n);

      if (shouldUpdate) {
        // Update buyToken ETH balance

        if (
          (!updatedEthToken.balance || updatedEthToken.balance === 0n) &&
          buyToken.balance &&
          buyToken.balance > 0n
        ) {
          setBuyToken({
            ...updatedEthToken,
            balance: buyToken.balance,
          });
        } else {
          setBuyToken(updatedEthToken);
        }
      }
    }
  }, [tokens]);

  // Enhanced token selection handlers with error clearing, memoized to prevent re-renders
  const handleSellTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values to prevent stale calculations
      setSellAmt("");
      setBuyAmt("");
      // Set the new token
      setSellToken(token);
    },
    [txError],
  );

  const handleBuyTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values to prevent stale calculations
      setSellAmt("");
      setBuyAmt("");
      // Set the new token
      setBuyToken(token);
    },
    [txError],
  );

  const flipTokens = () => {
    if (!buyToken) return;

    // Clear any errors when flipping tokens
    if (txError) setTxError(null);

    // Reset input values to prevent stale calculations
    setSellAmt("");
    setBuyAmt("");

    // Enhanced flip with better state handling
    const tempToken = sellToken;
    setSellToken(buyToken);
    setBuyToken(tempToken);

    // Ensure wallet connection is properly tracked during token swaps
    // This helps avoid "lost connection" errors when rapidly changing tokens
    if (address && isConnected) {
      sessionStorage.setItem("lastConnectedAddress", address);
    }
  };

  /* derived flags */
  const canSwap =
    sellToken &&
    buyToken &&
    // Special case for USDT custom pool
    (sellToken.isCustomPool ||
      buyToken?.isCustomPool ||
      // Original cases: ETH → Coin or Coin → ETH
      sellToken.id === null ||
      buyToken.id === null ||
      // New case: Coin → Coin (different IDs)
      (sellToken.id !== null &&
        buyToken?.id !== null &&
        sellToken.id !== buyToken.id));
  const isSellETH = sellToken.id === null;
  // For custom USDT-ETH pool, we need special logic to determine if it's a multihop
  // Check if either token is USDT by symbol instead of relying on token1
  const isSellUSDT = sellToken.isCustomPool && sellToken.symbol === "USDT";
  const isBuyUSDT = buyToken?.isCustomPool && buyToken?.symbol === "USDT";

  // USDT-ETH direct swaps (either direction) should NOT be treated as multihop
  const isDirectUsdtEthSwap =
    // ETH <-> USDT direct swap
    (sellToken.id === null && isBuyUSDT) ||
    (buyToken?.id === null && isSellUSDT);

  // Log the direct USDT swap detection for debugging
  if (sellToken.isCustomPool || buyToken?.isCustomPool) {
    console.log("ETH-USDT Swap Detection:", {
      isDirectUsdtEthSwap,
      sellIsETH: sellToken.id === null,
      buyIsETH: buyToken?.id === null,
      sellIsCustom: sellToken.isCustomPool,
      buyIsCustom: buyToken?.isCustomPool,
      isSellUSDT,
      isBuyUSDT,
      sellSymbol: sellToken.symbol,
      buySymbol: buyToken?.symbol,
    });
  }

  const isCoinToCoin =
    // Regular coin-to-coin logic (both have non-null IDs and different IDs)
    (sellToken.id !== null &&
      buyToken?.id !== null &&
      buyToken?.id !== undefined &&
      sellToken.id !== buyToken.id) ||
    // Handle custom pools only when they're part of a multi-hop (non-direct) swap
    ((sellToken.isCustomPool || buyToken?.isCustomPool) &&
      !isDirectUsdtEthSwap);
  // Ensure coinId is always a valid bigint, never undefined
  // Special case: if dealing with a custom pool like USDT, we need to use 0n but mark it as valid
  const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;
  let coinId;

  if (isCustomPool) {
    // For custom pools, use the non-ETH token's ID
    if (isSellETH) {
      coinId = buyToken?.id ?? 0n;
    } else {
      coinId = sellToken?.id ?? 0n;
    }
    console.log("Using custom pool coinId:", coinId?.toString());
  } else {
    // For regular pools, ensure valid non-zero ID
    coinId =
      (isSellETH
        ? buyToken?.id !== undefined
          ? buyToken.id
          : 0n
        : sellToken.id) ?? 0n;
  }

  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");

  /* additional wagmi hooks */
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const chainId = useChainId();

  // Update ethBalance when ETH token balance changes in tokens array
  useEffect(() => {
    const ethToken = tokens.find((t) => t.id === null);
    if (
      ethToken &&
      (ethBalance === undefined || ethToken.balance !== ethBalance)
    ) {
      setEthBalance(ethToken.balance);
    }
  }, [tokens, ethBalance]);

  // Get direct ETH balance from wagmi
  const { data: wagmiEthBalance } = useBalance({
    address,
    chainId: mainnet.id,
    scopeKey: "wagmiEthBalance",
  });

  // Update our tracked ETH balance when direct ETH balance changes - with caching
  useEffect(() => {
    if (isConnected && wagmiEthBalance && wagmiEthBalance.value !== undefined) {
      setEthBalance(wagmiEthBalance.value);

      // Only try to cache if we have an address
      if (address) {
        try {
          const ethCacheKey = `coinchan_eth_${address}`;
          const ethCacheTimestampKey = `${ethCacheKey}_timestamp`;

          localStorage.setItem(ethCacheKey, wagmiEthBalance.value.toString());
          localStorage.setItem(ethCacheTimestampKey, Date.now().toString());
        } catch (e) {
          // Cache error, can continue without caching
        }
      }
    }
  }, [isConnected, wagmiEthBalance, address]);

  useEffect(() => {
    if (isSuccess) {
      // Refresh ETH balance
      refetchEthBalance();

      // Refresh token balances with caching to improve performance
      const refreshTokenBalances = async () => {
        if (!publicClient || !address) return;

        try {
          // Wait a moment for transaction to fully propagate
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Refresh balances for the specific tokens involved in the transaction
          const tokensToRefresh = [sellToken, buyToken].filter(
            (t) => t && t.id !== null,
          );

          // Only continue if we have tokens to refresh
          if (tokensToRefresh.length > 0) {
            // Fetch updated balances
            const balancePromises = tokensToRefresh.map(async (token) => {
              if (!token || token.id === null) return null;

              try {
                // Get the user's balance of this specific token
                const newBalance = await publicClient.readContract({
                  address: CoinsAddress,
                  abi: CoinsAbi,
                  functionName: "balanceOf",
                  args: [address, token.id],
                });

                // Cache the balance
                const balanceCacheKey = `coinchan_token_balance_${address}_${token.id}`;
                const balanceCacheTimestampKey = `${balanceCacheKey}_timestamp`;

                try {
                  localStorage.setItem(balanceCacheKey, newBalance.toString());
                  localStorage.setItem(
                    balanceCacheTimestampKey,
                    Date.now().toString(),
                  );
                } catch (e) {
                  // Cache error, continue without caching
                }

                return {
                  id: token.id,
                  balance: newBalance as bigint,
                };
              } catch (error) {
                // Failed to get balance
                return null;
              }
            });

            await Promise.all(balancePromises);
          }

          // Force a refresh of ETH balance
          refetchEthBalance();
        } catch (error) {
          // Failed to refresh token balances
        }
      };

      refreshTokenBalances();
    }
  }, [
    isSuccess,
    refetchEthBalance,
    publicClient,
    address,
    sellToken,
    buyToken,
  ]);

  // Create ref outside the effect to maintain persistence between renders
  const prevPairRef = useRef<string | null>(null);

  // Reset UI state when tokens change
  useEffect(() => {
    // Get the current pair of tokens (regardless of buy/sell order)
    const currentPair = [sellToken.id, buyToken?.id].sort().toString();

    // Get previous pair from ref
    const prevPair = prevPairRef.current;

    // Only reset price chart if the actual pair changes (not just flip)
    if (prevPair !== null && prevPair !== currentPair) {
      setShowPriceChart(false);
    }

    // Always reset chart visibility when mode changes
    if (mode === "liquidity") {
      setShowPriceChart(false);
    }

    // Update the ref with current pair
    prevPairRef.current = currentPair;

    // Reset transaction data
    setTxHash(undefined);
    setTxError(null);

    // Reset amounts
    setSellAmt("");
    setBuyAmt("");
  }, [sellToken.id, buyToken?.id, mode, liquidityMode]);

  /* Calculate pool reserves */
  const [reserves, setReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);
  const [targetReserves, setTargetReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);

  // Fetch reserves directly
  useEffect(() => {
    const fetchReserves = async () => {
      // Check if we're dealing with a custom pool (like USDT)
      const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;

      // Skip fetch for invalid params, but explicitly allow custom pools even with id: 0n
      if (!publicClient) {
        // Skip if no publicClient available
        return;
      }

      // For regular coins (not custom pools), skip if coinId is invalid
      if (!isCustomPool && (!coinId || coinId === 0n)) {
        // Skip reserves fetch for invalid regular coin params
        return;
      }

      // Log for debugging
      console.log(
        "Fetching reserves for:",
        isCustomPool ? "custom pool" : `coinId: ${coinId}`,
      );

      try {
        let poolId;

        // Use the custom pool ID for USDT or similar custom pools
        if (isCustomPool) {
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
        } else {
          // Regular pool ID
          poolId = computePoolId(coinId);
        }

        const result = await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [poolId],
        });

        // Handle the returned data structure correctly
        // The contract might return more fields than just the reserves
        // Cast to unknown first, then extract the reserves from the array
        const poolData = result as unknown as readonly bigint[];

        setReserves({
          reserve0: poolData[0],
          reserve1: poolData[1],
        });
      } catch (err) {
        // Failed to fetch reserves
        setReserves(null);
      }
    };

    fetchReserves();
  }, [
    coinId,
    publicClient,
    sellToken?.isCustomPool,
    buyToken?.isCustomPool,
    sellToken?.poolId,
    buyToken?.poolId,
  ]);

  // Fetch target reserves for coin-to-coin swaps
  useEffect(() => {
    const fetchTargetReserves = async () => {
      // Allow custom pools with id: 0n but require a valid pool ID
      const isTargetCustomPool = buyToken?.isCustomPool;

      // First check if public client is available
      if (!publicClient) return;

      // Then check if this is a coin-to-coin swap
      if (!isCoinToCoin) return;

      // For regular tokens (not custom pools), make sure we have a valid ID
      if (!isTargetCustomPool && (!buyToken?.id || buyToken.id === 0n)) return;

      // Log for debugging
      console.log(
        "Fetching target reserves for:",
        isTargetCustomPool
          ? "custom target pool"
          : `target coinId: ${buyToken?.id}`,
      );

      try {
        let targetPoolId;

        // Use custom pool ID for special tokens like USDT
        if (isTargetCustomPool && buyToken?.poolId) {
          targetPoolId = buyToken.poolId;
        } else {
          // Regular pool ID
          targetPoolId = computePoolId(buyToken.id!);
        }

        const result = await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [targetPoolId],
        });

        const poolData = result as unknown as readonly bigint[];

        setTargetReserves({
          reserve0: poolData[0],
          reserve1: poolData[1],
        });
      } catch (err) {
        console.error("Failed to fetch target reserves:", err);
        setTargetReserves(null);
      }
    };

    fetchTargetReserves();
  }, [
    isCoinToCoin,
    buyToken?.id,
    publicClient,
    buyToken?.isCustomPool,
    buyToken?.poolId,
  ]);

  // Fetch LP token balance when a pool is selected and user is connected
  useEffect(() => {
    const fetchLpBalance = async () => {
      // Special handling for custom pools like USDT-ETH which may have ID=0
      const isCustomPool = sellToken?.isCustomPool || buyToken?.isCustomPool;

      // Don't early return for custom pools with ID=0
      if (!address || !publicClient) return;
      if (!isCustomPool && (!coinId || coinId === 0n)) return;

      try {
        // Calculate the pool ID - different method for custom pools
        let poolId;

        if (isCustomPool) {
          // Use the custom token's poolId if available
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
          console.log(
            "Fetching LP balance for custom pool:",
            customToken?.symbol,
            "pool ID:",
            poolId.toString(),
          );
        } else {
          // Regular pool ID calculation
          poolId = computePoolId(coinId);
        }

        // Read the user's LP token balance for this pool
        const balance = (await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "balanceOf",
          args: [address, poolId],
        })) as bigint;

        console.log(
          "LP token balance:",
          formatUnits(balance, 18),
          "for pool ID:",
          poolId.toString(),
        );
        setLpTokenBalance(balance);
      } catch (err) {
        console.error("Failed to fetch LP token balance:", err);
        setLpTokenBalance(0n);
      }
    };

    fetchLpBalance();
  }, [
    address,
    publicClient,
    coinId,
    sellToken?.isCustomPool,
    buyToken?.isCustomPool,
    sellToken?.poolId,
    buyToken?.poolId,
  ]);

  /* Check if user has approved ZAAM as operator */
  const [isOperator, setIsOperator] = useState<boolean | null>(null);
  const [usdtAllowance, setUsdtAllowance] = useState<bigint | null>(null);

  // Function to check USDT allowance - available in global scope
  const checkUsdtAllowance = async () => {
    if (!address || !publicClient) return null;

    try {
      // Make sure publicClient is fully initialized
      if (!publicClient.chain) {
        console.log(
          "Skipping USDT allowance check - publicClient not fully initialized",
        );
        return null;
      }

      console.log("Checking USDT allowance for address:", address);

      // ERC20 allowance check
      const allowance = await publicClient.readContract({
        address: USDT_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "owner", type: "address" },
              { internalType: "address", name: "spender", type: "address" },
            ],
            name: "allowance",
            outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
            stateMutability: "view",
            type: "function",
          },
        ],
        functionName: "allowance",
        args: [address, ZAAMAddress],
      });

      console.log("USDT allowance result:", (allowance as bigint).toString());
      setUsdtAllowance(allowance as bigint);
      return allowance as bigint;
    } catch (error) {
      // Log but don't crash - defaulting to 0 allowance is safe
      console.log(
        "Error checking USDT allowance, defaulting to 0:",
        error instanceof Error ? error.message : "Unknown error",
      );
      setUsdtAllowance(0n);
      return 0n;
    }
  };

  // USDT allowance checking effect
  useEffect(() => {
    // Check for any USDT tokens
    const checkUsdtRelevance = async () => {
      if (!address || !publicClient) return;

      // Enhanced check for USDT tokens in any position
      const isUsdtRelevant =
        // Check for USDT token1 address match
        (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
        (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
        // Check for USDT by symbol
        sellToken.symbol === "USDT" ||
        buyToken?.symbol === "USDT" ||
        // Check for custom pool with ID=0 (USDT pool)
        (sellToken.isCustomPool && sellToken.id === 0n) ||
        (buyToken?.isCustomPool && buyToken?.id === 0n) ||
        // Check if we're in liquidity mode with USDT
        (mode === "liquidity" &&
          ((sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
            (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS)));

      // Always log the check attempt
      console.log("Checking USDT allowance:", {
        isUsdtRelevant,
        sellTokenSymbol: sellToken.symbol,
        buyTokenSymbol: buyToken?.symbol,
        sellTokenIsCustom: sellToken.isCustomPool,
        sellTokenAddress: sellToken.token1,
      });

      if (isUsdtRelevant) {
        try {
          // Make sure publicClient is fully initialized
          if (!publicClient.chain) {
            console.log(
              "Skipping USDT allowance check - publicClient not fully initialized",
            );
            return;
          }

          console.log("Performing USDT allowance check...");

          // ERC20 allowance check
          const allowance = await publicClient.readContract({
            address: USDT_ADDRESS,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "owner", type: "address" },
                  { internalType: "address", name: "spender", type: "address" },
                ],
                name: "allowance",
                outputs: [
                  { internalType: "uint256", name: "", type: "uint256" },
                ],
                stateMutability: "view",
                type: "function",
              },
            ],
            functionName: "allowance",
            args: [address, ZAAMAddress],
          });

          console.log(
            "USDT allowance result:",
            (allowance as bigint).toString(),
          );
          setUsdtAllowance(allowance as bigint);
        } catch (error) {
          // Log but don't crash - defaulting to 0 allowance is safe
          console.log(
            "Error checking USDT allowance, defaulting to 0:",
            error instanceof Error ? error.message : "Unknown error",
          );
          setUsdtAllowance(0n);
        }
      }
    };

    const checkOperator = async () => {
      if (!address || !publicClient || isSellETH) return;

      try {
        const result = (await publicClient.readContract({
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "isOperator",
          args: [address, ZAAMAddress],
        })) as boolean;

        setIsOperator(result);
      } catch (err) {
        console.error("Failed to check operator status:", err);
        setIsOperator(null);
      }
    };

    // Run checks without extracting unnecessary variables
    checkOperator();

    // Check if any USDT token is in use and check allowance if needed
    // Use an IIFE to allow async execution in useEffect
    (async () => {
      try {
        await checkUsdtRelevance();
      } catch (error) {
        console.error("Error checking USDT relevance:", error);
      }
    })();
  }, [
    address,
    isSellETH,
    publicClient,
    sellToken?.isCustomPool,
    sellToken?.token1,
    buyToken?.isCustomPool,
    buyToken?.token1,
    mode,
  ]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    // In Remove Liquidity mode, track the LP burn amount separately
    if (mode === "liquidity" && liquidityMode === "remove") {
      setLpBurnAmount(val);

      // Calculate the expected token amounts based on the LP amount to burn
      if (!reserves || !val) {
        setSellAmt("");
        setBuyAmt("");
        return;
      }

      try {
        // Calculate the pool ID - different method for custom pools
        const customPoolUsed =
          sellToken?.isCustomPool || buyToken?.isCustomPool;
        let poolId;

        if (customPoolUsed) {
          // Use the custom token's poolId if available
          const customToken = sellToken?.isCustomPool ? sellToken : buyToken;
          poolId = customToken?.poolId || USDT_POOL_ID;
          console.log(
            "Getting pool info for custom pool:",
            customToken?.symbol,
            "pool ID:",
            poolId.toString(),
          );
        } else {
          // Regular pool ID calculation
          poolId = computePoolId(coinId);
        }

        const poolInfo = (await publicClient.readContract({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "pools",
          args: [poolId],
        })) as any;

        // Ensure we have pool data
        if (!poolInfo) return;

        // Extract supply from pool data (the 7th item in the array for this contract, index 6)
        const totalSupply = poolInfo[6] as bigint; // Pool struct has supply at index 6

        if (totalSupply === 0n) return;

        // Calculate proportional amount of tokens based on removeLiquidity calculation in ZAMM.sol
        const burnAmount = parseUnits(val || "0", 18);

        // Calculate amounts: amount0 = liquidity * reserve0 / totalSupply (from ZAMM.sol)
        // This is the mulDiv function in ZAMM.sol converted to TypeScript
        const ethAmount = (burnAmount * reserves.reserve0) / totalSupply;
        const tokenAmount = (burnAmount * reserves.reserve1) / totalSupply;

        // Log calculation details for debugging

        // Sanity checks
        if (ethAmount > reserves.reserve0 || tokenAmount > reserves.reserve1) {
          console.error("Error: Calculated redemption exceeds pool reserves!");
          setSellAmt("");
          setBuyAmt("");
          return;
        }

        // Update the input fields with the calculated values
        setSellAmt(ethAmount === 0n ? "" : formatEther(ethAmount));
        // Use the correct decimals for the token (6 for USDT, 18 for regular tokens)
        const tokenDecimals = customPoolUsed
          ? sellToken?.isCustomPool
            ? sellToken?.decimals || 6
            : buyToken?.decimals || 6
          : 18;

        console.log(
          "Preview calculation using decimals:",
          tokenDecimals,
          "for",
          sellToken?.isCustomPool ? sellToken?.symbol : buyToken?.symbol,
        );

        setBuyAmt(
          tokenAmount === 0n ? "" : formatUnits(tokenAmount, tokenDecimals),
        );
      } catch (err) {
        console.error("Error calculating remove liquidity amounts:", err);
        setSellAmt("");
        setBuyAmt("");
      }
      return;
    }

    // Single-ETH liquidity mode - estimate the token amount the user will get
    if (mode === "liquidity" && liquidityMode === "single-eth") {
      setSellAmt(val);
      // Allow custom pools like USDT with id=0
      if (
        !reserves ||
        !val ||
        !buyToken ||
        (buyToken.id === null && !buyToken.isCustomPool)
      ) {
        setSingleETHEstimatedCoin("");
        return;
      }

      try {
        // Get the pool ID for the selected token pair
        let poolId;

        // Check if this is a custom pool like USDT
        if (buyToken.isCustomPool && buyToken.poolId) {
          poolId = buyToken.poolId;
          console.log(
            "Using custom pool ID for Single-ETH estimation:",
            poolId.toString(),
          );
        } else {
          poolId = computePoolId(buyToken.id || 0n);
        }

        // Fetch fresh reserves for the selected token
        let targetReserves = { ...reserves };

        // If the token ID is different from the current reserves or we have a custom pool, fetch new reserves
        if (buyToken.id !== coinId || buyToken.isCustomPool) {
          try {
            const result = await publicClient?.readContract({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "pools",
              args: [poolId],
            });

            // If we have a result, use it; otherwise fall back to current reserves
            if (result) {
              const poolData = result as unknown as readonly bigint[];
              targetReserves = {
                reserve0: poolData[0],
                reserve1: poolData[1],
              };
            }
          } catch (err) {
            console.error(
              `Failed to fetch reserves for target token ${buyToken.id}:`,
              err,
            );
            // Continue with existing reserves as fallback
          }
        }

        // The contract will use half of the ETH to swap for tokens
        const halfEthAmount = parseEther(val || "0") / 2n;

        // Get correct swap fee for the token (30bps for USDT, default 100bps for regular tokens)
        const swapFee = buyToken?.isCustomPool
          ? buyToken.swapFee || SWAP_FEE
          : SWAP_FEE;

        console.log("Single-ETH estimation using:", {
          token: buyToken.symbol,
          ethAmount: formatEther(halfEthAmount),
          reserve0: formatEther(targetReserves.reserve0),
          reserve1: formatUnits(
            targetReserves.reserve1,
            buyToken.decimals || 18,
          ),
          swapFee: `${Number(swapFee) / 100}%`,
          isCustomPool: buyToken.isCustomPool,
        });

        // Estimate how many tokens we'll get for half the ETH
        const estimatedTokens = getAmountOut(
          halfEthAmount,
          targetReserves.reserve0,
          targetReserves.reserve1,
          swapFee,
        );

        // Update the estimated coin display
        if (estimatedTokens === 0n) {
          setSingleETHEstimatedCoin("");
        } else {
          // Use correct decimals for the token (6 for USDT, 18 for regular tokens)
          const tokenDecimals = buyToken?.isCustomPool
            ? buyToken.decimals || 18
            : 18;

          const formattedTokens = formatUnits(estimatedTokens, tokenDecimals);
          setSingleETHEstimatedCoin(formattedTokens);
        }
      } catch (err) {
        console.error("Error estimating Single-ETH token amount:", err);
        setSingleETHEstimatedCoin("");
      }
      return;
    }

    // Regular Add Liquidity or Swap mode
    setSellAmt(val);
    if (!canSwap || !reserves) return setBuyAmt("");

    try {
      // Different calculation paths based on swap type
      if (isCoinToCoin && targetReserves && buyToken?.id && sellToken.id) {
        // For coin-to-coin swaps, we need to estimate a two-hop swap
        try {
          // Dynamically import helper to avoid circular dependencies
          const { estimateCoinToCoinOutput } = await import("./lib/swap");

          // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
          const sellTokenDecimals = sellToken?.decimals || 18;
          const inUnits = parseUnits(val || "0", sellTokenDecimals);

          // Get correct swap fees for both pools
          const sourceSwapFee = sellToken.isCustomPool
            ? sellToken.swapFee || SWAP_FEE
            : SWAP_FEE;
          const targetSwapFee = buyToken?.isCustomPool
            ? buyToken.swapFee || SWAP_FEE
            : SWAP_FEE;

          // Pass custom swap fees for USDT or other custom pools
          const { amountOut } = estimateCoinToCoinOutput(
            sellToken.id,
            buyToken.id,
            inUnits,
            reserves,
            targetReserves,
            slippageBps, // Pass the current slippage tolerance setting
            sourceSwapFee, // Pass source pool fee (could be 30n for USDT)
            targetSwapFee, // Pass target pool fee (could be 30n for USDT)
          );

          // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
          const buyTokenDecimals = buyToken?.decimals || 18;
          setBuyAmt(
            amountOut === 0n ? "" : formatUnits(amountOut, buyTokenDecimals),
          );
        } catch (err) {
          console.error("Error estimating coin-to-coin output:", err);
          setBuyAmt("");
        }
      } else if (isSellETH) {
        // ETH → Coin path
        const inWei = parseEther(val || "0");
        const outUnits = getAmountOut(
          inWei,
          reserves.reserve0,
          reserves.reserve1,
          SWAP_FEE,
        );
        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        setBuyAmt(
          outUnits === 0n ? "" : formatUnits(outUnits, buyTokenDecimals),
        );
      } else {
        // Coin → ETH path
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        const inUnits = parseUnits(val || "0", sellTokenDecimals);
        const outWei = getAmountOut(
          inUnits,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
        );
        setBuyAmt(outWei === 0n ? "" : formatEther(outWei));
      }
    } catch {
      setBuyAmt("");
    }
  };

  const syncFromBuy = async (val: string) => {
    setBuyAmt(val);
    if (!canSwap || !reserves) return setSellAmt("");

    try {
      // Different calculation paths based on swap type
      if (isCoinToCoin) {
        // Calculating input from output for coin-to-coin is very complex
        // Would require a recursive solver to find the right input amount
        // For UI simplicity, we'll just clear the input and let the user adjust
        setSellAmt("");

        // Optional: Show a notification that this direction is not supported
      } else if (isSellETH) {
        // ETH → Coin path (calculate ETH input)
        // Use correct decimals for the buy token (6 for USDT, 18 for regular coins)
        const buyTokenDecimals = buyToken?.decimals || 18;
        const outUnits = parseUnits(val || "0", buyTokenDecimals);
        const inWei = getAmountIn(
          outUnits,
          reserves.reserve0,
          reserves.reserve1,
          SWAP_FEE,
        );
        setSellAmt(inWei === 0n ? "" : formatEther(inWei));
      } else {
        // Coin → ETH path (calculate Coin input)
        const outWei = parseEther(val || "0");
        const inUnits = getAmountIn(
          outWei,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
        );
        // Use correct decimals for the sell token (6 for USDT, 18 for regular coins)
        const sellTokenDecimals = sellToken?.decimals || 18;
        setSellAmt(
          inUnits === 0n ? "" : formatUnits(inUnits, sellTokenDecimals),
        );
      }
    } catch {
      setSellAmt("");
    }
  };

  // Loading state
  if (loading) {
    return <SpinnerLoader />;
  }

  // Main UI
  return (
    <Card className="w-full max-w-lg p-4 sm:p-6 border-2 border-border shadow-md rounded-xl dark:bg-card/95 dark:backdrop-blur-sm dark:shadow-[0_0_20px_rgba(0,204,255,0.07)]">
      <CardContent className="p-0 sm:p-1 flex flex-col space-y-1">
        {/* Info showing token count */}
        <div className="text-xs text-muted-foreground mb-2">
          Available tokens: {tokenCount} (ETH + {tokenCount - 1} coins, sorted
          by liquidity)
        </div>

        {/* Mode tabs */}
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as TileMode)}
          className="mb-2"
        >
          <TabsList className="w-full bg-primary dark:bg-background p-1 rounded-lg border border-border">
            <TabsTrigger
              value="swap"
              className="flex-1 data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
            >
              <ArrowDownUp className="h-4 w-4 mr-1" />
              <span className="text-sm text-primary-foreground">Swap</span>
            </TabsTrigger>
            <TabsTrigger
              value="liquidity"
              className="flex-1 data-[state=active]:bg-background dark:data-[state=active]:bg-card dark:data-[state=active]:shadow-[0_0_10px_rgba(0,204,255,0.15)] dark:data-[state=active]:border-primary data-[state=active]:border-border data-[state=active]:shadow-sm h-10 touch-manipulation text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="text-sm text-primary-foreground data-[state=active]:text-foreground">
                Liquidity
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Liquidity mode tabs - only show when in liquidity mode */}
        {mode === "liquidity" && <LiquidityActions />}
        {mode === "swap" && <SwapAction />}

        {/* Load error notification */}
        {loadError && (
          <div className="p-2 mb-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
            {loadError}
          </div>
        )}

        {/* SELL + FLIP + BUY panel container */}
        <div className="relative flex flex-col">
          {/* SELL/PROVIDE panel */}
          <div
            className={`border-2 border-primary/40 group hover:bg-secondary-foreground ${mode === "liquidity" && liquidityMode === "remove" ? "rounded-md" : "rounded-t-2xl"} p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60 flex flex-col gap-2 ${mode === "liquidity" && liquidityMode === "remove" ? "mt-2" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {mode === "swap"
                  ? "Sell"
                  : liquidityMode === "add"
                    ? "Provide"
                    : liquidityMode === "remove"
                      ? "You'll Receive (ETH)"
                      : "Provide ETH"}
              </span>
              {/* Render both options but hide one with CSS for hook stability */}
              <>
                {/* ETH-only display for Single-ETH mode */}
                <div
                  className={`flex items-center gap-2 bg-transparent border border-primary rounded-md px-2 py-1 ${mode === "liquidity" && liquidityMode === "single-eth" ? "" : "hidden"}`}
                >
                  <div className="w-8 h-8 overflow-hidden rounded-full">
                    <img
                      src={ETH_TOKEN.tokenUri}
                      alt="ETH"
                      className="w-8 h-8 object-cover"
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">ETH</span>
                    <div className="text-xs font-medium text-gray-700 min-w-[50px] h-[14px]">
                      {sellToken.balance !== undefined
                        ? formatEther(sellToken.balance)
                        : "0"}
                      {isEthBalanceFetching && (
                        <span
                          className="text-xs text-primary ml-1"
                          style={{ animation: "pulse 1.5s infinite" }}
                        >
                          ·
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Token selector for all other modes */}
                <div
                  className={
                    mode === "liquidity" && liquidityMode === "single-eth"
                      ? "hidden"
                      : ""
                  }
                >
                  <TokenSelector
                    selectedToken={sellToken}
                    tokens={memoizedTokens}
                    onSelect={handleSellTokenSelect}
                    isEthBalanceFetching={isEthBalanceFetching}
                  />
                  {/* Removed hidden balance update for debugging that was causing errors */}
                </div>
              </>
            </div>
            <div className="flex justify-between items-center">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.0"
                value={sellAmt}
                onChange={(e) => syncFromSell(e.target.value)}
                className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1 bg-transparent dark:text-foreground dark:placeholder-primary/50"
                readOnly={mode === "liquidity" && liquidityMode === "remove"}
              />
              {mode === "liquidity" && liquidityMode === "remove" && (
                <span className="text-xs text-primary font-medium">
                  Preview
                </span>
              )}
              {/* MAX button for using full balance */}
              {sellToken.balance !== undefined &&
                sellToken.balance > 0n &&
                (mode === "swap" ||
                  (mode === "liquidity" &&
                    (liquidityMode === "add" ||
                      liquidityMode === "single-eth"))) && (
                  <button
                    className="text-xs bg-primary/10 hover:bg-primary/20 text-primary font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px] border border-primary/30 shadow-[0_0_5px_rgba(0,204,255,0.15)]"
                    onClick={() => {
                      // For ETH, leave a small amount for gas
                      if (sellToken.id === null) {
                        // Get 99% of ETH balance to leave some for gas
                        const ethAmount =
                          ((sellToken.balance as bigint) * 99n) / 100n;
                        syncFromSell(formatEther(ethAmount));
                      } else {
                        // For other tokens, use the full balance with correct decimals
                        // Handle non-standard decimals like USDT (6 decimals)
                        const decimals = sellToken.decimals || 18;
                        syncFromSell(
                          formatUnits(sellToken.balance as bigint, decimals),
                        );
                      }
                    }}
                  >
                    MAX
                  </button>
                )}
            </div>
          </div>

          {/* FLIP button - only shown in swap mode */}
          {mode === "swap" && (
            <button
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 rounded-full shadow-xl
                bg-primary hover:bg-primary/80 focus:bg-primary/90 active:scale-95
                shadow-[0_0_15px_rgba(0,204,255,0.3)]
                focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all z-10 touch-manipulation"
              onClick={flipTokens}
            >
              <ArrowDownUp className="h-5 w-5 text-background" />
            </button>
          )}

          {/* ALL BUY/RECEIVE panels - rendering conditionally with CSS for hook stability */}
          {buyToken && (
            <>
              {/* Single-ETH mode panel */}
              <div
                className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2 ${mode === "liquidity" && liquidityMode === "single-eth" ? "" : "hidden"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Target Token
                  </span>
                  <TokenSelector
                    selectedToken={buyToken}
                    tokens={memoizedNonEthTokens} // Using pre-memoized non-ETH tokens
                    onSelect={handleBuyTokenSelect}
                    isEthBalanceFetching={isEthBalanceFetching}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xl font-medium w-full">
                    {singleETHEstimatedCoin || "0"}
                  </div>
                  <span className="text-xs text-primary font-medium">
                    Estimated
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Half of your ETH will be swapped for {buyToken.symbol} and
                  paired with the remaining ETH.
                </div>
              </div>

              {/* Standard BUY/RECEIVE panel */}
              <div
                className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2 ${!(mode === "liquidity" && liquidityMode === "single-eth") ? "" : "hidden"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {mode === "swap"
                      ? "Buy"
                      : liquidityMode === "add"
                        ? "And"
                        : `You'll Receive (${buyToken.symbol})`}
                  </span>
                  <TokenSelector
                    selectedToken={buyToken}
                    tokens={memoizedTokens}
                    onSelect={handleBuyTokenSelect}
                    isEthBalanceFetching={isEthBalanceFetching}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="any"
                    placeholder="0.0"
                    value={buyAmt}
                    onChange={(e) => syncFromBuy(e.target.value)}
                    className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1"
                    readOnly={
                      mode === "liquidity" && liquidityMode === "remove"
                    }
                  />
                  {mode === "liquidity" && liquidityMode === "remove" && (
                    <span className="text-xs text-chart-5 font-medium">
                      Preview
                    </span>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Network indicator */}
        {isConnected && chainId !== mainnet.id && (
          <div className="text-xs mt-1 px-2 py-1 bg-secondary/70 border border-primary/30 rounded text-foreground">
            <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in
            your wallet to{" "}
            {mode === "swap" ? "swap tokens" : "manage liquidity"}
          </div>
        )}

        {/* Slippage information - clickable to show settings */}
        <div
          onClick={() => setShowSlippageSettings(!showSlippageSettings)}
          className="text-xs mt-1 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-primary cursor-pointer hover:bg-primary/10 transition-colors"
        >
          <div className="flex justify-between items-center">
            <span>
              <strong>Slippage Tolerance:</strong>{" "}
              {mode === "liquidity" && liquidityMode === "single-eth"
                ? `${Number(singleEthSlippageBps) / 100}%`
                : `${Number(slippageBps) / 100}%`}
            </span>
            <span className="text-xs text-foreground-secondary">
              {showSlippageSettings ? "▲" : "▼"}
            </span>
          </div>

          {/* Slippage Settings Panel */}
          {showSlippageSettings && (
            <div
              className="mt-2 p-2 bg-primary-background border border-accent rounded-md shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2">
                <div className="flex gap-1 flex-wrap">
                  {SLIPPAGE_OPTIONS.map((option) => (
                    <button
                      key={option.value.toString()}
                      onClick={() =>
                        mode === "liquidity" && liquidityMode === "single-eth"
                          ? setSingleEthSlippageBps(option.value)
                          : setSlippageBps(option.value)
                      }
                      className={`px-2 py-1 text-xs rounded ${
                        (
                          mode === "liquidity" && liquidityMode === "single-eth"
                            ? singleEthSlippageBps === option.value
                            : slippageBps === option.value
                        )
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {/* Simple custom slippage input */}
                  <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/70 text-foreground">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      max="50"
                      step="0.1"
                      placeholder=""
                      className="w-12 bg-transparent outline-none text-center"
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        if (isNaN(value) || value < 0.1 || value > 50) return;

                        // Convert percentage to basis points
                        const bps = BigInt(Math.floor(value * 100));

                        if (
                          mode === "liquidity" &&
                          liquidityMode === "single-eth"
                        ) {
                          setSingleEthSlippageBps(bps);
                        } else {
                          setSlippageBps(bps);
                        }
                      }}
                    />
                    <span>%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mode-specific information */}
        {mode === "liquidity" && (
          <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
            {liquidityMode === "add" ? (
              <>
                <p className="font-medium mb-1">Adding liquidity provides:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>LP tokens as a proof of your position</li>
                  <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
                  <li>Withdraw your liquidity anytime</li>
                </ul>
              </>
            ) : liquidityMode === "remove" ? (
              <>
                <p className="font-medium mb-1">Remove Liquidity:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>
                    Your LP balance: {formatUnits(lpTokenBalance, 18)} LP tokens
                  </li>
                  <li>Enter amount of LP tokens to burn</li>
                  <li>Preview shows expected return of ETH and tokens</li>
                </ul>
              </>
            ) : (
              <>
                <p className="font-medium mb-1">Single-Sided ETH Liquidity:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Provide only ETH to participate in a pool</li>
                  <li>Half your ETH is swapped to tokens automatically</li>
                  <li>Remaining ETH + tokens are added as liquidity</li>
                  <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
                </ul>
              </>
            )}
          </div>
        )}

        {/* Pool information */}
        {canSwap && reserves && (
          <div className="text-xs text-foreground flex justify-between px-1 mt-1">
            {mode === "swap" &&
            isCoinToCoin &&
            !isDirectUsdtEthSwap &&
            // Extra sanity check - don't show multihop if one token is ETH and the other is USDT
            !(
              (sellToken.id === null && buyToken?.symbol === "USDT") ||
              (buyToken?.id === null && sellToken.symbol === "USDT")
            ) ? (
              <span className="flex items-center">
                <span className="bg-chart-5/20 text-chart-5 px-1 rounded mr-1">
                  Multi-hop
                </span>
                {sellToken.symbol} → ETH → {buyToken?.symbol}
              </span>
            ) : (
              <span>
                Pool: {formatEther(reserves.reserve0).substring(0, 8)} ETH /{" "}
                {formatUnits(
                  reserves.reserve1,
                  // Use the correct decimals for the token (6 for USDT, 18 for others)
                  isCustomPool
                    ? sellToken.isCustomPool
                      ? sellToken.decimals || 18
                      : buyToken?.decimals || 18
                    : 18,
                ).substring(0, 8)}{" "}
                {coinId
                  ? tokens.find((t) => t.id === coinId)?.symbol || "Token"
                  : buyToken?.symbol}
              </span>
            )}
            <span>
              Fee:{" "}
              {
                // For USDT direct swaps, show the 0.3% fee
                isCustomPool &&
                // Direct USDT-ETH swaps are not multihop
                ((sellToken.id === null &&
                  buyToken?.isCustomPool &&
                  buyToken?.token1 === USDT_ADDRESS) ||
                  (buyToken?.id === null &&
                    sellToken.isCustomPool &&
                    sellToken.token1 === USDT_ADDRESS) ||
                  // Other direct USDT swaps
                  !isCoinToCoin)
                  ? "0.3%"
                  : // For multihop swaps, show double fee
                    mode === "swap" && isCoinToCoin
                    ? (Number(SWAP_FEE) * 2) / 100 + "%"
                    : // Default 1% fee for regular swaps
                      Number(SWAP_FEE) / 100 + "%"
              }
            </span>
          </div>
        )}

        {/* ACTION BUTTON */}
        <Button
          onClick={
            mode === "swap"
              ? executeSwap
              : liquidityMode === "add"
                ? executeAddLiquidity
                : liquidityMode === "remove"
                  ? executeRemoveLiquidity
                  : executeSingleETHLiquidity // Single-ETH mode
          }
          disabled={
            !isConnected ||
            (mode === "swap" && (!canSwap || !sellAmt)) ||
            (mode === "liquidity" &&
              liquidityMode === "add" &&
              (!canSwap || !sellAmt)) ||
            (mode === "liquidity" &&
              liquidityMode === "remove" &&
              (!lpBurnAmount ||
                parseFloat(lpBurnAmount) <= 0 ||
                parseUnits(lpBurnAmount || "0", 18) > lpTokenBalance)) ||
            (mode === "liquidity" &&
              liquidityMode === "single-eth" &&
              (!canSwap || !sellAmt || !reserves)) ||
            isPending
          }
          className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation dark:bg-primary dark:text-card dark:hover:bg-primary/90 dark:shadow-[0_0_20px_rgba(0,204,255,0.3)]"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {mode === "swap"
                ? "Swapping…"
                : liquidityMode === "add"
                  ? "Adding Liquidity…"
                  : liquidityMode === "remove"
                    ? "Removing Liquidity…"
                    : "Adding Single-ETH Liquidity…"}
            </span>
          ) : mode === "swap" ? (
            "Swap"
          ) : liquidityMode === "add" ? (
            "Add Liquidity"
          ) : (
            "Add Single-ETH Liquidity"
          )}
        </Button>

        {/* Status and error messages */}
        {/* Show transaction statuses */}
        {txError && txError.includes("Waiting for") && (
          <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
            {txError}
          </div>
        )}

        {/* Show actual errors (only if not a user rejection) */}
        {((writeError && !isUserRejectionError(writeError)) ||
          (txError && !txError.includes("Waiting for"))) && (
          <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
            {writeError && !isUserRejectionError(writeError)
              ? writeError.message
              : txError}
          </div>
        )}

        {/* Success message */}
        {isSuccess && (
          <div className="text-sm text-chart-2 mt-2 flex items-center bg-background/50 p-2 rounded border border-chart-2/20">
            <CheckIcon className="h-3 w-3 mr-2" />
            Transaction confirmed!
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PoolActions;
