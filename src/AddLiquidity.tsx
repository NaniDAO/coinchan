import { Loader2 } from "lucide-react";
import { TokenSelector } from "./components/TokenSelector";
import { SuccessMessage } from "./components/SuccessMessage";
import { Button } from "./components/ui/button";
import {
  computePoolId,
  computePoolKey,
  DEADLINE_SEC,
  getAmountIn,
  getAmountOut,
  SLIPPAGE_BPS,
  SWAP_FEE,
  withSlippage,
} from "./lib/swap";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOperatorStatus } from "./hooks/use-operator-status";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { ZAAMAbi, ZAAMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { useWaitForTransactionReceipt } from "wagmi";
import {
  ETH_TOKEN,
  TokenMeta,
  USDT_ADDRESS,
  USDT_POOL_ID,
  USDT_POOL_KEY,
} from "./lib/coins";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { SlippageSettings } from "./components/SlippageSettings";
import { NetworkError } from "./components/NetworkError";
import { ZAMMHelperAbi, ZAMMHelperAddress } from "./constants/ZAMMHelper";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { nowSec } from "./lib/utils";
import { mainnet } from "viem/chains";

export const AddLiquidity = () => {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({
    chainId,
  });
  const { tokens, isEthBalanceFetching } = useAllCoins();

  /* State */

  /* user inputs */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");

  const [sellToken, setSellToken] = useState<TokenMeta>(ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<TokenMeta | null>(null);

  /* Calculate pool reserves */
  const [reserves, setReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);
  const [targetReserves, setTargetReserves] = useState<{
    reserve0: bigint;
    reserve1: bigint;
  } | null>(null);

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  /* Check if user has approved ZAAM as operator */
  const { data: isOperator, refetch: refetchOperator } =
    useOperatorStatus(address);
  const [usdtAllowance, setUsdtAllowance] = useState<bigint | null>(null);

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

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

  const memoizedTokens = useMemo(() => tokens, [tokens]);

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
        (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
        (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS);

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

    // Execute the check function
    checkUsdtRelevance();
  }, [address, publicClient, sellToken, buyToken]);

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

  // Reset UI state when tokens change
  useEffect(() => {
    // Reset transaction data
    setTxHash(undefined);
    setTxError(null);

    // Reset amounts
    setSellAmt("");
    setBuyAmt("");
  }, [sellToken.id, buyToken?.id]);

  useEffect(() => {
    if (!buyToken && tokens.length > 1) {
      setBuyToken(tokens[1]);
    }
  }, [tokens, buyToken]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
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

  // Function to approve USDT token for spending by ZAMM contract
  const approveUsdtToken = async () => {
    if (!address || !publicClient || !writeContractAsync) {
      setTxError("Wallet connection required");
      return false;
    }

    try {
      // We don't need to set the txError here since it's already set by the caller
      // (to maintain consistent UX with operator approval)
      console.log("Starting USDT approval process");

      // Standard ERC20 approval for a large amount (max uint256 value would be too gas intensive)
      // 2^64 should be plenty for most transactions (18.4 quintillion units)
      const approvalAmount = 2n ** 64n;

      console.log(
        "Requesting approval for USDT amount:",
        approvalAmount.toString(),
      );

      const hash = await writeContractAsync({
        address: USDT_ADDRESS,
        abi: [
          {
            inputs: [
              { internalType: "address", name: "spender", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" },
            ],
            name: "approve",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ],
        functionName: "approve",
        args: [ZAAMAddress, approvalAmount],
      });

      setTxError("USDT approval submitted. Waiting for confirmation...");
      console.log("USDT approval transaction submitted:", hash);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });

      if (receipt.status === "success") {
        console.log("USDT approval successful");
        setTxError(null); // Clear the error message as the approval succeeded

        // Set allowance directly to our approval amount first to ensure UI responsiveness
        const approvalAmount = 2n ** 64n;
        setUsdtAllowance(approvalAmount);

        // Optionally refresh allowance in the background for accuracy
        try {
          // Refresh the allowance directly without calling checkUsdtAllowance
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
            "Updated USDT allowance after approval:",
            (allowance as bigint).toString(),
          );
          setUsdtAllowance(allowance as bigint);
        } catch (err) {
          console.warn(
            "Failed to refresh USDT allowance, but approval succeeded:",
            err,
          );
          // We already set the allowance above, so this is just for logging
          // No need to set allowance again
        }
        return true;
      } else {
        console.error("USDT approval transaction failed", receipt);
        setTxError("USDT approval failed. Please try again.");
        return false;
      }
    } catch (err) {
      // Handle user rejection separately to avoid alarming errors
      if (isUserRejectionError(err)) {
        console.log("User rejected USDT approval");
        setTxError("USDT approval rejected");
        return false;
      }

      // Use our utility to handle other wallet errors
      const errorMsg = handleWalletError(err);
      setTxError(errorMsg || "Failed to approve USDT");
      console.error("USDT approval error:", err);
      return false;
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

      // Check if we're dealing with the special USDT token
      let poolKey;
      const isUsdtPool = sellToken.isCustomPool || buyToken?.isCustomPool;

      // Enhanced detection of USDT usage for add liquidity
      // We need to make sure we detect all cases where USDT is being used
      const isUsingUsdt =
        // Standard checks for USDT token address
        (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
        (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
        // Additional checks by symbol and ID for redundancy
        sellToken.symbol === "USDT" ||
        buyToken?.symbol === "USDT" ||
        // Check for custom pool with ID=0 (USDT pool)
        (sellToken.isCustomPool && sellToken.id === 0n) ||
        (buyToken?.isCustomPool && buyToken?.id === 0n);

      console.log("Add liquidity with possible USDT:", {
        isUsdtPool,
        isUsingUsdt,
        sellTokenSymbol: sellToken.symbol,
        buyTokenSymbol: buyToken?.symbol,
        sellTokenIsCustom: sellToken.isCustomPool,
        sellTokenAddress: sellToken.token1,
        buyTokenIsCustom: buyToken?.isCustomPool,
        buyTokenAddress: buyToken?.token1,
      });

      // Get the amount of USDT being used
      let usdtAmount = 0n;
      if (isUsingUsdt) {
        console.log("USDT token detected for liquidity addition");

        // Determine which token is USDT and get its amount
        if (
          (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) ||
          sellToken.symbol === "USDT"
        ) {
          usdtAmount = parseUnits(sellAmt, 6); // USDT has 6 decimals
          console.log(
            "Using USDT as sell token with amount:",
            usdtAmount.toString(),
          );
        } else if (
          (buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) ||
          buyToken?.symbol === "USDT"
        ) {
          usdtAmount = parseUnits(buyAmt, 6); // USDT has 6 decimals
          console.log(
            "Using USDT as buy token with amount:",
            usdtAmount.toString(),
          );
        }

        // Check if we need to verify USDT allowance first
        if (usdtAllowance === null) {
          console.log("USDT allowance is null, checking now...");
          await checkUsdtAllowance();
        }

        // If USDT amount is greater than allowance, request approval
        if (
          usdtAllowance === null ||
          usdtAllowance === 0n ||
          usdtAmount > usdtAllowance
        ) {
          console.log("USDT approval needed for liquidity:", {
            usdtAmount: usdtAmount.toString(),
            allowance: usdtAllowance?.toString() || "0",
          });

          // Maintain consistent UX with operator approval flow
          setTxError(
            "Waiting for USDT approval. Please confirm the transaction...",
          );
          const approved = await approveUsdtToken();
          if (!approved) {
            return; // Stop if approval failed or was rejected
          }
        } else {
          console.log("USDT already approved for liquidity:", {
            allowance: usdtAllowance.toString(),
            requiredAmount: usdtAmount.toString(),
          });
        }
      }

      if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId);
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // In ZAMM's design, for all pools:
      // - token0 is always ETH (zeroAddress), id0 is 0
      // - token1 is always the Coin contract (or USDT for custom pool), id1 is the coinId

      // So we need to ensure:
      // - amount0 is the ETH amount (regardless of which input field the user used)
      // - amount1 is the Coin amount

      // Use correct decimals for token1 (6 for USDT, 18 for regular coins)
      const tokenDecimals = isUsdtPool ? 6 : 18;

      const amount0 = isSellETH ? parseEther(sellAmt) : parseEther(buyAmt); // ETH amount
      const amount1 = isSellETH
        ? parseUnits(buyAmt, tokenDecimals)
        : parseUnits(sellAmt, tokenDecimals); // Token amount

      // Verify we have valid amounts
      if (amount0 === 0n || amount1 === 0n) {
        setTxError("Invalid liquidity amounts");
        return;
      }

      // Slippage protection will be calculated after getting exact amounts from ZAMMHelper

      // Check for USDT approvals first if using USDT pool
      if (
        isUsdtPool &&
        !isSellETH &&
        usdtAllowance !== null &&
        amount1 > usdtAllowance
      ) {
        try {
          // First, show a notification about the approval step
          setTxError(
            "Waiting for USDT approval. Please confirm the transaction...",
          );

          // Max approve (uint256 max)
          const maxApproval = 2n ** 256n - 1n;

          // Send the approval transaction
          const approvalHash = await writeContractAsync({
            address: USDT_ADDRESS,
            abi: [
              {
                inputs: [
                  { internalType: "address", name: "spender", type: "address" },
                  { internalType: "uint256", name: "amount", type: "uint256" },
                ],
                name: "approve",
                outputs: [{ internalType: "bool", name: "", type: "bool" }],
                stateMutability: "nonpayable",
                type: "function",
              },
            ],
            functionName: "approve",
            args: [ZAAMAddress, maxApproval],
          });

          // Show a waiting message
          setTxError("USDT approval submitted. Waiting for confirmation...");

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            setUsdtAllowance(maxApproval);
            setTxError(null); // Clear the message
          } else {
            setTxError("USDT approval failed. Please try again.");
            return;
          }
        } catch (err) {
          // Use our utility to handle wallet errors
          const errorMsg = handleWalletError(err);
          if (errorMsg) {
            console.error("Failed to approve USDT:", err);
            setTxError("Failed to approve USDT");
          }
          return;
        }
      }

      // Check if the user needs to approve ZAMM as operator for their Coin token
      // This is needed when the user is providing Coin tokens (not just ETH)
      // Since we're always providing Coin tokens in liquidity, we need approval
      // Only needed for regular Coin tokens, not for USDT
      if (!isUsdtPool && isOperator === false) {
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
            await refetchOperator();
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
        const actualAmount0Min = withSlippage(calcAmount0, slippageBps);
        const actualAmount1Min = withSlippage(calcAmount1, slippageBps);

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

  return (
    <div className="relative flex flex-col">
      {/* SELL/PROVIDE panel */}
      <div
        className={`border-2 border-primary/40 group hover:bg-secondary-foreground rounded-t-2xl p-2 pb-4 focus-within:ring-2 focus-within:ring-primary/60 flex flex-col gap-2`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Provide</span>
          <div className={""}>
            <TokenSelector
              selectedToken={sellToken}
              tokens={memoizedTokens}
              onSelect={handleSellTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
            />
          </div>
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
            readOnly={false}
          />
          {/* MAX button for using full balance */}
          {sellToken.balance !== undefined && sellToken.balance > 0n && (
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

        {/* Standard BUY/RECEIVE panel */}
        {buyToken && (
          <div
            className={`border-2 border-primary/40 group rounded-b-2xl p-2 pt-3 focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary/60 shadow-[0_0_15px_rgba(0,204,255,0.07)] flex flex-col gap-2 mt-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">And</span>
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
                readOnly={false}
              />
            </div>
          </div>
        )}
      </div>

      <NetworkError message="manage liquidity" />

      {/* Slippage information - clickable to show settings */}
      <SlippageSettings
        slippageBps={slippageBps}
        setSlippageBps={setSlippageBps}
      />
      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground">
        <p className="font-medium mb-1">Adding liquidity provides:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>LP tokens as a proof of your position</li>
          <li>Earn {Number(SWAP_FEE) / 100}% fees from trades</li>
          <li>Withdraw your liquidity anytime</li>
        </ul>
      </div>
      <Button
        onClick={executeAddLiquidity}
        disabled={!isConnected || isPending}
        className="w-full text-base sm:text-lg mt-4 h-12 touch-manipulation dark:bg-primary dark:text-card dark:hover:bg-primary/90 dark:shadow-[0_0_20px_rgba(0,204,255,0.3)]"
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Adding Single-ETH Liquidity…
          </span>
        ) : (
          "Add Liquidity"
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
      {isSuccess && <SuccessMessage />}
    </div>
  );
};
