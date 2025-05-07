/**
 * SwapTile Component
 * 
 * This component allows users to swap ETH for Coins, Coins for ETH, add/remove liquidity, and 
 * perform single-sided ETH liquidity provision. It uses the new CoinsMetadataHelper contract
 * for efficient data fetching in a single call rather than multiple separate calls.
 * 
 * The CoinsMetadataHelper.sol contract provides the following optimizations:
 * 1. Gets all coin metadata (name, symbol, tokenURI) in batch
 * 2. Gets pool reserves for each coin in the same call
 * 3. Gets user balances for ETH and all coins in a single call
 * 4. Gets user LP token balances in the same batch
 * 
 * This significantly reduces the number of RPC calls needed and improves loading performance.
 */
import { mainnet } from "viem/chains";
import { useState, useEffect } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
  useChainId,
} from "wagmi";
import { handleWalletError, isUserRejectionError } from "./utils";
import {
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  keccak256,
  zeroAddress,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
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
import { Loader2, ArrowDownUp, Plus, Minus } from "lucide-react";
import {
  estimateContractGas,
  simulateContractInteraction,
} from "./lib/simulate";
import { useTokensFast, ETH_TOKEN } from "@/hooks/use-tokens-fast";
import { TokenSelectorFast } from "@/components/TokenSelectorFast";

/* ────────────────────────────────────────────────────────────────────────────
  CONSTANTS & HELPERS
──────────────────────────────────────────────────────────────────────────── */
const SWAP_FEE = 100n; // 1% pool fee
const DEFAULT_SLIPPAGE_BPS = 200n; // 2% default slippage tolerance for regular swaps
const DEFAULT_SINGLE_ETH_SLIPPAGE_BPS = 500n; // 5% default slippage tolerance for Single-ETH operations
const DEADLINE_SEC = 20 * 60; // 20 minutes

// Slippage options for the selector
const SLIPPAGE_OPTIONS = [
  { label: "0.5%", value: 50n },
  { label: "1%", value: 100n },
  { label: "2%", value: 200n },
  { label: "3%", value: 300n },
  { label: "5%", value: 500n },
];

// Calculate amount with slippage tolerance applied
const getAmountWithSlippage = (amount: bigint, slippageBps: bigint) =>
  (amount * (10000n - slippageBps)) / 10000n;

export interface TokenMeta {
  id: bigint | null; // null = ETH pseudo-token
  name: string;
  symbol: string;
  tokenUri?: string; // Equivalent to tokenURI in CoinData
  reserve0?: bigint; // ETH reserves in the pool
  reserve1?: bigint; // Token reserves in the pool
  poolId?: bigint; // Pool ID for this token
  liquidity?: bigint; // Total pool liquidity
  balance?: bigint; // User's balance of this token
  lpBalance?: bigint; // User's LP token balance for this pool
}

const computePoolKey = (coinId: bigint) => ({
  id0: 0n,
  id1: coinId,
  token0: zeroAddress,
  token1: CoinsAddress,
  swapFee: SWAP_FEE,
});

const computePoolId = (coinId: bigint) =>
  BigInt(
    keccak256(
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 id0, uint256 id1, address token0, address token1, uint96 swapFee",
        ),
        [0n, coinId, zeroAddress, CoinsAddress, SWAP_FEE],
      ),
    ),
  );

// x*y=k AMM with fee — forward (amountIn → amountOut)
const getAmountOut = (
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;

  const amountInWithFee = amountIn * (10000n - swapFee);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  return numerator / denominator;
};

// inverse — desired amountOut → required amountIn
const getAmountIn = (
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  swapFee: bigint,
) => {
  if (
    amountOut === 0n ||
    reserveIn === 0n ||
    reserveOut === 0n ||
    amountOut >= reserveOut
  )
    return 0n;

  const numerator = reserveIn * amountOut * 10000n;
  const denominator = (reserveOut - amountOut) * (10000n - swapFee);
  return numerator / denominator + 1n; // +1 for ceiling rounding
};

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";
type LiquidityMode = "add" | "remove" | "single-eth";

/* ────────────────────────────────────────────────────────────────────────────
  SwapTile main component
──────────────────────────────────────────────────────────────────────────── */
export const SwapTile = () => {
  const { tokens, loading, patchBalances } = useTokensFast();

  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);
  const [mode, setMode] = useState<TileMode>("swap");
  const [liquidityMode, setLiquidityMode] = useState<LiquidityMode>("add");

  // Slippage settings with defaults
  const [slippageBps, setSlippageBps] = useState<bigint>(DEFAULT_SLIPPAGE_BPS);
  const [singleEthSlippageBps, setSingleEthSlippageBps] = useState<bigint>(
    DEFAULT_SINGLE_ETH_SLIPPAGE_BPS,
  );
  const [showSlippageSettings, setShowSlippageSettings] =
    useState<boolean>(false);

  // Helper functions for slippage calculation
  const withSlippage = (amount: bigint) =>
    getAmountWithSlippage(amount, slippageBps);
  const withSingleEthSlippage = (amount: bigint) =>
    getAmountWithSlippage(amount, singleEthSlippageBps);

  // Single-ETH estimation values
  const [singleETHEstimatedCoin, setSingleETHEstimatedCoin] =
    useState<string>("");

  // When switching to single-eth mode, ensure ETH is selected as the sell token
  // and set a default target token if none is selected
  useEffect(() => {
    if (mode === "liquidity" && liquidityMode === "single-eth") {
      // If current sell token is not ETH, set it to ETH
      if (sellToken.id !== null) {
        const ethToken = tokens.find((token) => token.id === null);
        if (ethToken) {
          setSellToken(ethToken);
        }
      }

      // If no target token is selected or it's ETH, set a default non-ETH token
      if (!buyToken || buyToken.id === null) {
        // Find the first non-ETH token with the highest liquidity
        const defaultTarget = tokens.find((token) => token.id !== null);
        if (defaultTarget) {
          setBuyToken(defaultTarget);
        }
      }
    }
  }, [mode, liquidityMode, sellToken.id, buyToken, tokens]);
  const [lpTokenBalance, setLpTokenBalance] = useState<bigint>(0n);
  const [lpBurnAmount, setLpBurnAmount] = useState<string>("");

  // Get wagmi hooks
  const { address, isConnected } = useAccount();

  // Get the public client for contract interactions
  const publicClient = usePublicClient({ chainId: mainnet.id });

  // Debug info
  const tokenCount = tokens.length;

  // Set initial buyToken once tokens are loaded
  useEffect(() => {
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  const handleBuyTokenSelect = (token: TokenMeta) => {
    setBuyToken(token);
  };

  const flipTokens = () => {
    if (!buyToken) return;

    // Simple flip
    const tempToken = sellToken;
    setSellToken(buyToken);
    setBuyToken(tempToken);
  };

  /* derived flags */
  const canSwap =
    sellToken &&
    buyToken &&
    // Original cases: ETH → Coin or Coin → ETH
    (sellToken.id === null ||
      buyToken.id === null ||
      // New case: Coin → Coin (different IDs)
      (sellToken.id !== null &&
        buyToken?.id !== null &&
        sellToken.id !== buyToken.id));
  const isSellETH = sellToken.id === null;
  const isCoinToCoin =
    sellToken.id !== null &&
    buyToken?.id !== null &&
    buyToken?.id !== undefined &&
    sellToken.id !== buyToken.id;
  const coinId = (isSellETH ? buyToken?.id : sellToken.id) ?? 0n;

  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  /* additional wagmi hooks */
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const chainId = useChainId();

  /* Calculate pool reserves */
  const [reserves, setReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);
  const [targetReserves, setTargetReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);

  // Use pool reserves directly from token data
  useEffect(() => {
    if (!coinId || coinId === 0n) {
      setReserves(null);
      return;
    }
    
    // Find the token that matches the selected coinId
    const selectedToken = tokens.find(token => token.id === coinId);
    
    if (selectedToken && selectedToken.reserve0 !== undefined && selectedToken.reserve1 !== undefined) {
      // Use reserves directly from the token data (from CoinsMetadataHelper)
      setReserves({
        reserve0: selectedToken.reserve0,
        reserve1: selectedToken.reserve1
      });
    } else if (publicClient) {
      // Fallback to direct fetching if needed
      const fetchReserves = async () => {
        try {
          const poolId = computePoolId(coinId);
          const result = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [poolId],
          });
          
          const poolData = result as unknown as readonly bigint[];
          
          setReserves({
            reserve0: poolData[0],
            reserve1: poolData[1]
          });
        } catch (err) {
          console.error("Failed to fetch reserves:", err);
          setReserves(null);
        }
      };
      
      fetchReserves();
    }
  }, [coinId, publicClient, tokens]);
  
  // Use target pool reserves from token data for coin-to-coin swaps
  useEffect(() => {
    if (!isCoinToCoin || !buyToken?.id || buyToken.id === 0n) {
      setTargetReserves(null);
      return;
    }
    
    // Find the token that matches the target coinId
    const targetToken = tokens.find(token => token.id === buyToken.id);
    
    if (targetToken && targetToken.reserve0 !== undefined && targetToken.reserve1 !== undefined) {
      // Use reserves directly from the token data
      setTargetReserves({
        reserve0: targetToken.reserve0,
        reserve1: targetToken.reserve1
      });
    } else if (publicClient) {
      // Fallback to direct fetching if needed
      const fetchTargetReserves = async () => {
        try {
          const targetPoolId = computePoolId(buyToken.id!);
          const result = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [targetPoolId],
          });
          
          const poolData = result as unknown as readonly bigint[];
          
          setTargetReserves({
            reserve0: poolData[0],
            reserve1: poolData[1]
          });
        } catch (err) {
          console.error("Failed to fetch target reserves:", err);
          setTargetReserves(null);
        }
      };
      
      fetchTargetReserves();
    }
  }, [isCoinToCoin, buyToken?.id, publicClient, tokens]);
  
  // Update LP token balance when a pool is selected
  useEffect(() => {
    if (!address || !coinId || coinId === 0n) {
      setLpTokenBalance(0n);
      return;
    }
    
    // Find the token that matches the selected coinId
    const selectedToken = tokens.find(token => token.id === coinId);
    
    if (selectedToken && selectedToken.lpBalance !== undefined) {
      // Use the LP balance directly from token data (from CoinsMetadataHelper)
      setLpTokenBalance(selectedToken.lpBalance);
    } else if (publicClient) {
      // Fallback to direct fetching if not available
      const fetchLpBalance = async () => {
        try {
          const poolId = computePoolId(coinId);
          const balance = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "balanceOf",
            args: [address, poolId],
          }) as bigint;
          
          setLpTokenBalance(balance);
        } catch (err) {
          console.error("Failed to fetch LP token balance:", err);
          setLpTokenBalance(0n);
        }
      };
      
      fetchLpBalance();
    } else {
      setLpTokenBalance(0n);
    }
  }, [address, publicClient, coinId, tokens]);

  /* Check if user has approved ZAAM as operator */
  const [isOperator, setIsOperator] = useState<boolean | null>(null);

  useEffect(() => {
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

    checkOperator();
  }, [address, isSellETH, publicClient]);

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
        // Read the pool's total supply
        const poolId = computePoolId(coinId);
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
        setBuyAmt(tokenAmount === 0n ? "" : formatUnits(tokenAmount, 18));
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
      if (!reserves || !val || !buyToken || buyToken.id === null) {
        setSingleETHEstimatedCoin("");
        return;
      }

      try {
        // Get the pool ID for the selected token pair
        const poolId = computePoolId(buyToken.id);

        // Fetch fresh reserves for the selected token
        let targetReserves = { ...reserves };

        // If the token ID is different from the current reserves, fetch new reserves
        if (buyToken.id !== coinId) {
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

        // Estimate how many tokens we'll get for half the ETH
        const estimatedTokens = getAmountOut(
          halfEthAmount,
          targetReserves.reserve0,
          targetReserves.reserve1,
          SWAP_FEE,
        );

        // Update the estimated coin display
        if (estimatedTokens === 0n) {
          setSingleETHEstimatedCoin("");
        } else {
          const formattedTokens = formatUnits(estimatedTokens, 18);
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
          const { estimateCoinToCoinOutput } = await import("./lib/swapHelper");

          const inUnits = parseUnits(val || "0", 18);
          const { amountOut } = estimateCoinToCoinOutput(
            sellToken.id,
            buyToken.id,
            inUnits,
            reserves,
            targetReserves,
            slippageBps, // Pass the current slippage tolerance setting
          );

          // For debugging purposes, log the estimated ETH intermediary amount
          if (amountOut > 0n) {
          }

          setBuyAmt(amountOut === 0n ? "" : formatUnits(amountOut, 18));
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
        setBuyAmt(outUnits === 0n ? "" : formatUnits(outUnits, 18));
      } else {
        // Coin → ETH path
        const inUnits = parseUnits(val || "0", 18);
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
        const outUnits = parseUnits(val || "0", 18);
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
        setSellAmt(inUnits === 0n ? "" : formatUnits(inUnits, 18));
      }
    } catch {
      setSellAmt("");
    }
  };

  /* perform swap */
  const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

  // Execute Single-Sided ETH Liquidity Provision
  const executeSingleETHLiquidity = async () => {
    // Validate inputs
    if (!address || !publicClient || !buyToken?.id) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid ETH amount");
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Make sure buyToken.id is properly processed as a BigInt
      // This ensures both searched and manually selected tokens work the same
      const targetTokenId =
        typeof buyToken.id === "bigint"
          ? buyToken.id
          : buyToken.id !== null && buyToken.id !== undefined
            ? BigInt(String(buyToken.id))
            : 0n; // Fallback to 0n if ID is null/undefined (shouldn't happen based on validation)

      // Use the selected buyToken's ID to compute the pool key
      const targetPoolKey = computePoolKey(targetTokenId);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);
      const ethAmount = parseEther(sellAmt);

      // Get the reserves for the selected token
      let targetReserves = reserves;

      // If the target token is different from coinId, fetch the correct reserves
      if (targetTokenId !== coinId) {
        try {
          // Get the pool ID for the target token
          const targetPoolId = computePoolId(targetTokenId);

          const result = await publicClient.readContract({
            address: ZAAMAddress,
            abi: ZAAMAbi,
            functionName: "pools",
            args: [targetPoolId],
          });

          const poolData = result as unknown as readonly bigint[];
          targetReserves = {
            reserve0: poolData[0],
            reserve1: poolData[1],
          };
        } catch (err) {
          console.error(
            `Failed to fetch reserves for ${buyToken.symbol}:`,
            err,
          );
          setTxError(
            `Failed to get pool data for ${buyToken.symbol}. Please try again.`,
          );
          return;
        }
      }

      if (
        !targetReserves ||
        targetReserves.reserve0 === 0n ||
        targetReserves.reserve1 === 0n
      ) {
        setTxError(
          `No liquidity available for ${buyToken.symbol}. Please select another token.`,
        );
        return;
      }

      // Half of the ETH will be swapped to tokens by the contract
      const halfEthAmount = ethAmount / 2n;

      // Estimate how many tokens we'll get for half the ETH
      const estimatedTokens = getAmountOut(
        halfEthAmount,
        targetReserves.reserve0,
        targetReserves.reserve1,
        SWAP_FEE,
      );

      // Apply higher slippage tolerance for Single-ETH operations
      const minTokenAmount = withSingleEthSlippage(estimatedTokens);

      // Min amounts for the addLiquidity portion with higher slippage for less liquid pools
      const amount0Min = withSingleEthSlippage(halfEthAmount);
      const amount1Min = withSingleEthSlippage(estimatedTokens);

      // Call addSingleLiqETH on the ZAMMSingleLiqETH contract
      const hash = await writeContractAsync({
        address: ZAMMSingleLiqETHAddress,
        abi: ZAMMSingleLiqETHAbi,
        functionName: "addSingleLiqETH",
        args: [
          targetPoolKey,
          minTokenAmount, // Minimum tokens from swap
          amount0Min, // Minimum ETH for liquidity
          amount1Min, // Minimum tokens for liquidity
          address, // LP tokens receiver
          deadline,
        ],
        value: ethAmount, // Send the full ETH amount
      });

      setTxHash(hash);
    } catch (err: unknown) {
      // Enhanced error handling with specific messages for common failure cases
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
      ) {
        if (err.message.includes("InsufficientOutputAmount")) {
          console.error("Slippage too high in low liquidity pool:", err);
          setTxError(
            "Slippage too high in low liquidity pool. Try again with a smaller amount or use a pool with more liquidity.",
          );
        } else if (err.message.includes("K(")) {
          console.error("Pool balance constraints not satisfied:", err);
          setTxError(
            "Pool balance constraints not satisfied. This usually happens with extreme price impact in low liquidity pools.",
          );
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Single-sided ETH liquidity execution error:", err);
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        console.error("Unknown error in Single-ETH liquidity:", err);
        setTxError("An unexpected error occurred. Please try again.");
      }
    }
  };

  const executeRemoveLiquidity = async () => {
    // Validate inputs
    if (!reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!lpBurnAmount || parseFloat(lpBurnAmount) <= 0) {
      setTxError("Please enter a valid amount of LP tokens to burn");
      return;
    }

    // Check if burn amount exceeds user's balance
    const burnAmount = parseUnits(lpBurnAmount, 18);
    if (burnAmount > lpTokenBalance) {
      setTxError(
        `You only have ${formatUnits(lpTokenBalance, 18)} LP tokens available`,
      );
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      const poolKey = computePoolKey(coinId);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // Parse the minimum amounts from the displayed expected return
      const amount0Min = sellAmt ? withSlippage(parseEther(sellAmt)) : 0n;
      const amount1Min = buyAmt ? withSlippage(parseUnits(buyAmt, 18)) : 0n;

      // Call removeLiquidity on the ZAMM contract
      const hash = await writeContractAsync({
        address: ZAAMAddress,
        abi: ZAAMAbi,
        functionName: "removeLiquidity",
        args: [poolKey, burnAmount, amount0Min, amount1Min, address, deadline],
      });

      setTxHash(hash);
    } catch (err) {
      // Use our utility to handle wallet errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Remove liquidity execution error:", err);
        setTxError(errorMsg);
      }
    }
  };

  const executeAddLiquidity = async () => {
    // More specific input validation to catch issues early
    if (!canSwap || !reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid sell amount");
      return;
    }

    if (!buyAmt || parseFloat(buyAmt) <= 0) {
      setTxError("Please enter a valid buy amount");
      return;
    }

    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      const poolKey = computePoolKey(coinId);
      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // In ZAMM's design, for all pools:
      // - token0 is always ETH (zeroAddress), id0 is 0
      // - token1 is always the Coin contract, id1 is the coinId

      // So we need to ensure:
      // - amount0 is the ETH amount (regardless of which input field the user used)
      // - amount1 is the Coin amount

      const amount0 = isSellETH ? parseEther(sellAmt) : parseEther(buyAmt); // ETH amount
      const amount1 = isSellETH
        ? parseUnits(buyAmt, 18)
        : parseUnits(sellAmt, 18); // Coin amount

      // Verify we have valid amounts
      if (amount0 === 0n || amount1 === 0n) {
        setTxError("Invalid liquidity amounts");
        return;
      }

      // Slippage protection will be calculated after getting exact amounts from ZAMMHelper

      // Check if the user needs to approve ZAMM as operator for their Coin token
      // This is needed when the user is providing Coin tokens (not just ETH)
      // Since we're always providing Coin tokens in liquidity, we need approval
      if (isOperator === false) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for operator approval. Please confirm the transaction...",
          );

          // Send the approval transaction
          const approvalHash = await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [ZAAMAddress, true],
          });

          // Show a waiting message
          setTxError(
            "Operator approval submitted. Waiting for confirmation...",
          );

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            setIsOperator(true);
            setTxError(null); // Clear the message
          } else {
            setTxError("Operator approval failed. Please try again.");
            return;
          }
        } catch (err) {
          // Use our utility to handle wallet errors
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Failed to approve operator:", err);
            setTxError("Failed to approve the liquidity contract as operator");
          }
          return;
        }
      }

      // Use ZAMMHelper to calculate the exact ETH amount to provide
      try {
        // The contract call returns an array of values rather than an object
        const result = await publicClient.readContract({
          address: ZAMMHelperAddress,
          abi: ZAMMHelperAbi,
          functionName: "calculateRequiredETH",
          args: [
            poolKey,
            amount0, // amount0Desired
            amount1, // amount1Desired
          ],
        });

        // Extract the values from the result array
        const [ethAmount, calcAmount0, calcAmount1] = result as [
          bigint,
          bigint,
          bigint,
        ];

        // Detailed logging to help with debugging

        // Calculate minimum amounts based on the actual amounts that will be used by the contract
        const actualAmount0Min = withSlippage(calcAmount0);
        const actualAmount1Min = withSlippage(calcAmount1);

        // Use the ethAmount from ZAMMHelper as the exact value to send
        // IMPORTANT: We should also use the exact calculated amounts for amount0Desired and amount1Desired
        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "addLiquidity",
          args: [
            poolKey,
            calcAmount0, // use calculated amount0 as amount0Desired
            calcAmount1, // use calculated amount1 as amount1Desired
            actualAmount0Min, // use adjusted min based on calculated amount
            actualAmount1Min, // use adjusted min based on calculated amount
            address, // to
            deadline,
          ],
          value: ethAmount, // Use the exact ETH amount calculated by ZAMMHelper
        });

        setTxHash(hash);
      } catch (calcErr) {
        // Use our utility to handle wallet errors
        const errorMsg = handleWalletError(calcErr);
        if (errorMsg) {
          console.error(
            "Error calling ZAMMHelper.calculateRequiredETH:",
            calcErr,
          );
          setTxError("Failed to calculate exact ETH amount");
        }
        return;
      }
    } catch (err) {
      // Handle errors, but don't display errors for user rejections
      // Use our utility to properly handle wallet errors
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Add liquidity execution error:", err);

        // More specific error messages based on error type
        if (err instanceof Error) {
          if (err.message.includes("insufficient funds")) {
            setTxError("Insufficient funds for this transaction");
          } else if (err.message.includes("InvalidMsgVal")) {
            // This is our critical error where the msg.value doesn't match what the contract expects
            setTxError(
              "Contract rejected ETH value. Please try again with different amounts.",
            );
            console.error(
              "ZAMM contract rejected the ETH value due to strict msg.value validation.",
            );
          } else {
            setTxError("Transaction failed. Please try again.");
          }
        } else {
          setTxError("Unknown error during liquidity provision");
        }
      }
    }
  };

  const executeSwap = async () => {
    if (!canSwap || !reserves || !address || !sellAmt || !publicClient) return;
    setTxError(null);

    try {
      // Check if we're on mainnet
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      const poolKey = computePoolKey(coinId);

      if (isSellETH) {
        const amountInWei = parseEther(sellAmt || "0");
        const rawOut = getAmountOut(
          amountInWei,
          reserves.reserve0,
          reserves.reserve1,
          SWAP_FEE,
        );

        if (rawOut === 0n) {
          setTxError("Output amount is zero. Check pool liquidity.");
          return;
        }

        // simulate multicall
        const result = await simulateContractInteraction({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut),
            true,
            address,
            nowSec() + BigInt(DEADLINE_SEC),
          ],
          value: amountInWei,
        });

        const gas = await estimateContractGas({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut),
            true,
            address,
            nowSec() + BigInt(DEADLINE_SEC),
          ],
          value: amountInWei,
        });

        console.log("simulation result:", { result, gas });

        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInWei,
            withSlippage(rawOut),
            true,
            address,
            nowSec() + BigInt(DEADLINE_SEC),
          ],
          value: amountInWei,
          gas: gas,
        });
        setTxHash(hash);
      } else {
        const amountInUnits = parseUnits(sellAmt || "0", 18);

        // Approve ZAAM as operator if needed
        if (isOperator === false) {
          try {
            // First, show a notification about the approval step
            setTxError(
              "Waiting for operator approval. Please confirm the transaction...",
            );

            // Send the approval transaction
            const approvalHash = await writeContractAsync({
              address: CoinsAddress,
              abi: CoinsAbi,
              functionName: "setOperator",
              args: [ZAAMAddress, true],
            });

            // Show a waiting message
            setTxError(
              "Operator approval submitted. Waiting for confirmation...",
            );

            // Wait for the transaction to be mined
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: approvalHash,
            });

            // Check if the transaction was successful
            if (receipt.status === "success") {
              setIsOperator(true);
              setTxError(null); // Clear the message
            } else {
              setTxError("Operator approval failed. Please try again.");
              return;
            }
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Failed to approve operator:", err);
              setTxError("Failed to approve the swap contract as operator");
            }
            return;
          }
        }

        // If we have two different Coin IDs, use the multicall path for Coin to Coin swap
        if (
          buyToken?.id !== null &&
          sellToken.id !== null &&
          buyToken?.id !== sellToken.id
        ) {
          try {
            // Import our helper dynamically to avoid circular dependencies
            const { createCoinSwapMulticall, estimateCoinToCoinOutput } =
              await import("./lib/swapHelper");

            // Fetch target coin reserves
            const targetPoolId = computePoolId(buyToken.id!);
            const targetPoolResult = await publicClient.readContract({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "pools",
              args: [targetPoolId],
            });

            const targetPoolData =
              targetPoolResult as unknown as readonly bigint[];
            const targetReserves = {
              reserve0: targetPoolData[0],
              reserve1: targetPoolData[1],
            };

            // Estimate the final output amount and intermediate ETH amount
            const {
              amountOut,
              withSlippage: minAmountOut,
              ethAmountOut,
            } = estimateCoinToCoinOutput(
              sellToken.id!,
              buyToken.id!,
              amountInUnits,
              reserves, // source reserves
              targetReserves, // target reserves
              slippageBps, // Use current slippage setting
            );

            if (amountOut === 0n) {
              setTxError("Output amount is zero. Check pool liquidity.");
              return;
            }

            // Create the multicall data for coin-to-coin swap via ETH
            const multicallData = createCoinSwapMulticall(
              sellToken.id!,
              buyToken.id!,
              amountInUnits,
              ethAmountOut, // Pass the estimated ETH output for the second swap
              minAmountOut,
              address,
            );

            // Log the calls we're making for debugging
            // simulate multicall
            const result = await simulateContractInteraction({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
            });

            const gas = await estimateContractGas({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
            });

            console.log("simulation result:", {
              result,
              gas,
            });

            // Execute the multicall transaction
            const hash = await writeContractAsync({
              address: ZAAMAddress,
              abi: ZAAMAbi,
              functionName: "multicall",
              args: [multicallData],
              gas,
            });

            setTxHash(hash);
            return;
          } catch (err) {
            // Use our utility to handle wallet errors
            const errorMsg = handleWalletError(err);
            if (errorMsg) {
              console.error("Error in multicall swap:", err);
              setTxError("Failed to execute coin-to-coin swap");
            }
            return;
          }
        }

        // Default path for Coin to ETH swap
        const rawOut = getAmountOut(
          amountInUnits,
          reserves.reserve1,
          reserves.reserve0,
          SWAP_FEE,
        );

        if (rawOut === 0n) {
          setTxError("Output amount is zero. Check pool liquidity.");
          return;
        }

        const hash = await writeContractAsync({
          address: ZAAMAddress,
          abi: ZAAMAbi,
          functionName: "swapExactIn",
          args: [
            poolKey,
            amountInUnits,
            withSlippage(rawOut),
            false,
            address,
            nowSec() + BigInt(DEADLINE_SEC),
          ],
        });
        setTxHash(hash);
      }
    } catch (err: unknown) {
      // Enhanced error handling with specific messages for common swap failure cases
      if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof err.message === "string"
      ) {
        if (err.message.includes("InsufficientOutputAmount")) {
          console.error("Swap failed due to price movement:", err);
          setTxError(
            "Swap failed due to price movement in low liquidity pool. Try again or use a smaller amount.",
          );
        } else if (err.message.includes("K(")) {
          console.error("Pool balance constraints not satisfied:", err);
          setTxError(
            "Swap failed due to pool constraints. This usually happens with large orders in small pools.",
          );
        } else {
          // Default to standard error handling
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Swap execution error:", err);
            setTxError(errorMsg);
          }
        }
      } else {
        // Fallback for non-standard errors
        console.error("Unknown error during swap:", err);
        setTxError("An unexpected error occurred. Please try again.");
      }
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // Main UI
  return (
    <Card className="w-full max-w-lg p-4 sm:p-6 border-2 border-yellow-100 shadow-md rounded-xl">
      <CardContent className="p-0 sm:p-1 flex flex-col space-y-1">
        {/* Info showing token count */}
        <div className="text-xs text-gray-500 mb-2">
          Available tokens: {tokenCount} (ETH + {tokenCount - 1} coins, sorted
          by liquidity)
        </div>

        {/* Mode tabs */}
        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as TileMode)}
          className="mb-2"
        >
          <TabsList className="w-full bg-yellow-50 p-1 rounded-lg border border-yellow-100">
            <TabsTrigger
              value="swap"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
            >
              <ArrowDownUp className="h-4 w-4 mr-1" />
              <span className="text-sm sm:text-base">Swap</span>
            </TabsTrigger>
            <TabsTrigger
              value="liquidity"
              className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="text-sm sm:text-base">Liquidity</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Liquidity mode tabs - only show when in liquidity mode */}
        {mode === "liquidity" && (
          <Tabs
            value={liquidityMode}
            onValueChange={(value) => setLiquidityMode(value as LiquidityMode)}
            className="mb-2"
          >
            <TabsList className="w-full bg-yellow-50 p-1 rounded-lg border border-yellow-100">
              <TabsTrigger
                value="add"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
              >
                <Plus className="h-4 w-4 mr-1" />
                <span className="text-xs sm:text-sm">Add</span>
              </TabsTrigger>
              <TabsTrigger
                value="remove"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
              >
                <Minus className="h-4 w-4 mr-1" />
                <span className="text-xs sm:text-sm">Remove</span>
              </TabsTrigger>
              <TabsTrigger
                value="single-eth"
                className="flex-1 data-[state=active]:bg-white data-[state=active]:border-yellow-200 data-[state=active]:shadow-sm h-10 touch-manipulation"
              >
                <span className="text-xs font-medium mr-1">Ξ</span>
                <span className="text-xs sm:text-sm">Single-ETH</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {/* SELL + FLIP + BUY panel container */}
        <div className="relative flex flex-col">
          {/* LP Amount Input (only visible in Remove Liquidity mode) */}
          {mode === "liquidity" && liquidityMode === "remove" && (
            <div className="border-2 border-yellow-500 group hover:bg-yellow-50 rounded-t-2xl p-3 pb-4 focus-within:ring-2 focus-within:ring-primary flex flex-col gap-2 bg-yellow-50">
              <div className="flex items-center justify-between">
                <span className="font-medium text-yellow-800">
                  LP Tokens to Burn
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-yellow-700">
                    Balance: {formatUnits(lpTokenBalance, 18)}
                  </span>
                  <button
                    className="text-xs bg-yellow-200 hover:bg-yellow-300 text-yellow-800 font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px]"
                    onClick={() =>
                      syncFromSell(formatUnits(lpTokenBalance, 18))
                    }
                  >
                    MAX
                  </button>
                </div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.0"
                value={lpBurnAmount}
                onChange={(e) => syncFromSell(e.target.value)}
                className="text-lg sm:text-xl font-medium w-full bg-yellow-50 focus:outline-none h-10 text-right pr-1"
              />
              <div className="text-xs text-yellow-600 mt-1">
                Enter the amount of LP tokens you want to burn to receive ETH
                and tokens back.
              </div>
            </div>
          )}

          {/* SELL/PROVIDE panel */}
          <div
            className={`border-2 border-yellow-300 group hover:bg-yellow-50 ${mode === "liquidity" && liquidityMode === "remove" ? "rounded-md" : "rounded-t-2xl"} p-2 pb-4 focus-within:ring-2 focus-within:ring-primary flex flex-col gap-2 ${mode === "liquidity" && liquidityMode === "remove" ? "mt-2" : ""}`}
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
              {/* Hide token selector in single-eth mode since only ETH is allowed */}
              {mode === "liquidity" && liquidityMode === "single-eth" ? (
                <div className="flex items-center gap-2 bg-transparent border border-yellow-200 rounded-md px-2 py-1">
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
                    </div>
                  </div>
                </div>
              ) : (
                <TokenSelectorFast
                  tokens={tokens}
                  selected={sellToken}
                  onSelect={setSellToken}
                  patchBalances={patchBalances}
                />
              )}
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
                className="text-lg sm:text-xl font-medium w-full focus:outline-none h-10 text-right pr-1"
                readOnly={mode === "liquidity" && liquidityMode === "remove"}
              />
              {mode === "liquidity" && liquidityMode === "remove" && (
                <span className="text-xs text-yellow-600 font-medium">
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
                    className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 font-medium px-3 py-1.5 rounded touch-manipulation min-w-[50px]"
                    onClick={() => {
                      // For ETH, leave a small amount for gas
                      if (sellToken.id === null) {
                        // Get 99% of ETH balance to leave some for gas
                        const ethAmount =
                          ((sellToken.balance as bigint) * 99n) / 100n;
                        syncFromSell(formatEther(ethAmount));
                      } else {
                        // For other tokens, use the full balance
                        syncFromSell(
                          formatUnits(sellToken.balance as bigint, 18),
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
                bg-yellow-500 hover:bg-yellow-600 focus:bg-yellow-600 active:scale-95
                focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all z-10 touch-manipulation"
              onClick={flipTokens}
            >
              <ArrowDownUp className="h-5 w-5 text-white" />
            </button>
          )}

          {/* BUY/RECEIVE panel - Enhanced for Single-ETH mode with token selector */}
          {buyToken &&
            mode === "liquidity" &&
            liquidityMode === "single-eth" && (
              <div className="border-2 border-yellow-300 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-yellow-50 focus-within:ring-primary flex flex-col gap-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Target Token
                  </span>
                  <TokenSelectorFast
                    tokens={tokens.filter(t => t.id !== null)}  
                    selected={buyToken!}                        
                    onSelect={handleBuyTokenSelect}
                    patchBalances={patchBalances}               
                  />
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-xl font-medium w-full">
                    {singleETHEstimatedCoin || "0"}
                  </div>
                  <span className="text-xs text-yellow-600 font-medium">
                    Estimated
                  </span>
                </div>
                <div className="text-xs text-yellow-600 mt-1">
                  Half of your ETH will be swapped for {buyToken.symbol} and
                  paired with the remaining ETH.
                </div>
              </div>
            )}

          {/* Standard BUY/RECEIVE panel - only show in swap mode or regular add/remove liquidity */}
          {buyToken &&
            !(mode === "liquidity" && liquidityMode === "single-eth") && (
              <div className="border-2 border-yellow-300 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-yellow-50 focus-within:ring-primary flex flex-col gap-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {mode === "swap"
                      ? "Buy"
                      : liquidityMode === "add"
                        ? "And"
                        : `You'll Receive (${buyToken.symbol})`}
                  </span>
                  <TokenSelectorFast
                    tokens={tokens}
                    selected={buyToken!}
                    onSelect={handleBuyTokenSelect}
                    patchBalances={patchBalances}
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
                    <span className="text-xs text-yellow-600 font-medium">
                      Preview
                    </span>
                  )}
                </div>
              </div>
            )}
        </div>

        {/* Network indicator */}
        {isConnected && chainId !== mainnet.id && (
          <div className="text-xs mt-1 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">
            <strong>Wrong Network:</strong> Please switch to Ethereum mainnet in
            your wallet to{" "}
            {mode === "swap" ? "swap tokens" : "manage liquidity"}
          </div>
        )}

        {/* Slippage information - clickable to show settings */}
        <div
          onClick={() => setShowSlippageSettings(!showSlippageSettings)}
          className="text-xs mt-1 px-2 py-1 bg-blue-50 border border-blue-100 rounded text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors"
        >
          <div className="flex justify-between items-center">
            <span>
              <strong>Slippage Tolerance:</strong>{" "}
              {mode === "liquidity" && liquidityMode === "single-eth"
                ? `${Number(singleEthSlippageBps) / 100}%`
                : `${Number(slippageBps) / 100}%`}
            </span>
            <span className="text-xs text-blue-500">
              {showSlippageSettings ? "▲" : "▼"}
            </span>
          </div>

          {/* Slippage Settings Panel */}
          {showSlippageSettings && (
            <div
              className="mt-2 p-2 bg-white border border-blue-200 rounded-md shadow-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2">
                <div className="font-medium mb-1">
                  {mode === "liquidity" && liquidityMode === "single-eth"
                    ? "Single-ETH"
                    : "Regular"}{" "}
                  Slippage:
                </div>
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
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                  {/* Simple custom slippage input */}
                  <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0.1"
                      max="50"
                      step="0.1"
                      placeholder="Custom"
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
          <div className="text-xs bg-yellow-50 border border-yellow-200 rounded p-2 mt-2 text-yellow-800">
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
          <div className="text-xs text-gray-500 flex justify-between px-1 mt-1">
            {mode === "swap" && isCoinToCoin ? (
              <span className="flex items-center">
                <span className="bg-yellow-200 text-yellow-800 px-1 rounded mr-1">
                  Multi-hop
                </span>
                {sellToken.symbol} → ETH → {buyToken?.symbol}
              </span>
            ) : (
              <span>
                Pool: {formatEther(reserves.reserve0).substring(0, 8)} ETH /{" "}
                {formatUnits(reserves.reserve1, 18).substring(0, 8)}{" "}
                {buyToken?.symbol}
              </span>
            )}
            <span>
              Fee:{" "}
              {mode === "swap" && isCoinToCoin
                ? (Number(SWAP_FEE) * 2) / 100
                : Number(SWAP_FEE) / 100}
              %
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
          className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation"
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
          ) : liquidityMode === "remove" ? (
            "Remove Liquidity"
          ) : (
            "Add Single-ETH Liquidity"
          )}
        </Button>

        {/* Status and error messages */}
        {/* Show transaction statuses */}
        {txError && txError.includes("Waiting for") && (
          <div className="text-sm text-yellow-600 mt-2 flex items-center">
            <Loader2 className="h-3 w-3 animate-spin mr-2" />
            {txError}
          </div>
        )}

        {/* Show actual errors (only if not a user rejection) */}
        {((writeError && !isUserRejectionError(writeError)) ||
          (txError && !txError.includes("Waiting for"))) && (
          <div className="text-sm text-red-600 mt-2">
            {writeError && !isUserRejectionError(writeError)
              ? writeError.message
              : txError}
          </div>
        )}

        {/* Success message */}
        {isSuccess && (
          <div className="text-sm text-green-600 mt-2 flex items-center">
            <svg
              className="h-3 w-3 mr-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Transaction confirmed!
          </div>
        )}

        {/* Subtle explorer link */}
        <div className="text-xs text-gray-400 mt-4 text-center">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              // This assumes App.tsx has access to this function via props
              window.dispatchEvent(
                new CustomEvent("coinchan:setView", { detail: "menu" }),
              );
            }}
            className="hover:text-gray-600 hover:underline"
          >
            View all coins in explorer
          </a>
        </div>
      </CardContent>
    </Card>
  );
};

export default SwapTile;
