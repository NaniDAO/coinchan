import { Loader2 } from "lucide-react";
import {
  DEADLINE_SEC,
  SLIPPAGE_BPS,
  SWAP_FEE,
  type ZAMMPoolKey,
  analyzeTokens,
  computePoolKey,
  getPoolIds,
  withSlippage,
} from "./lib/swap";
import { PoolApyDisplay } from "./components/ApyDisplay";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOperatorStatus } from "./hooks/use-operator-status";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";
import { formatEther, formatUnits, parseEther, parseUnits } from "viem";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { useWaitForTransactionReceipt } from "wagmi";
import { TokenMeta, USDT_ADDRESS, USDT_POOL_KEY, CULT_ADDRESS, CULT_POOL_KEY, ENS_ADDRESS, ENS_POOL_KEY } from "./lib/coins";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import { determineReserveSource, getHelperContractInfo } from "./lib/coin-utils";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { SlippageSettings } from "./components/SlippageSettings";
import { NetworkError } from "./components/NetworkError";
import { ZAMMHelperAbi, ZAMMHelperAddress } from "./constants/ZAMMHelper";
import { ZAMMHelperV1Abi, ZAMMHelperV1Address } from "./constants/ZAMMHelperV1";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CookbookAddress, CookbookAbi } from "./constants/Cookbook";
import { nowSec, formatNumber } from "./lib/utils";
import { mainnet } from "viem/chains";
import { SwapPanel } from "./components/SwapPanel";
import { useReserves } from "./hooks/use-reserves";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { SuccessMessage } from "./components/SuccessMessage";
import { useReadContract } from "wagmi";

// Helper function to calculate square root for LP token calculation
const sqrt = (value: bigint): bigint => {
  if (value < 0n) {
    throw new Error("Square root of negative numbers is not supported");
  }
  if (value === 0n) return 0n;

  let z = value;
  let x = value / 2n + 1n;
  while (x < z) {
    z = x;
    x = (value / x + x) / 2n;
  }
  return z;
};

export const AddLiquidity = () => {
  const { t } = useTranslation();
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
  const [estimatedLpTokens, setEstimatedLpTokens] = useState<string>("");
  const [estimatedPoolShare, setEstimatedPoolShare] = useState<string>("");

  // Use shared token selection context
  const { sellToken, buyToken, setSellToken, setBuyToken } = useTokenSelection();

  const { isSellETH, isCustom, isCoinToCoin, coinId, canSwap } = useMemo(
    () => analyzeTokens(sellToken, buyToken),
    [sellToken, buyToken],
  );

  /* Calculate pool reserves */
  const { mainPoolId, targetPoolId } = getPoolIds(sellToken, buyToken, {
    isCustomPool: isCustom,
    isCoinToCoin: isCoinToCoin,
  });

  // Simple direct handling for CULT, ENS and other custom pools
  const { actualPoolId, reserveSource } = useMemo(() => {
    // Direct CULT handling
    if (sellToken.symbol === "CULT" || buyToken?.symbol === "CULT") {
      return {
        actualPoolId: sellToken.symbol === "CULT" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "COOKBOOK" as const,
      };
    }
    
    // Direct ENS handling
    if (sellToken.symbol === "ENS" || buyToken?.symbol === "ENS") {
      return {
        actualPoolId: sellToken.symbol === "ENS" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "COOKBOOK" as const,
      };
    }

    // USDT handling
    if (sellToken.symbol === "USDT" || buyToken?.symbol === "USDT") {
      return {
        actualPoolId: sellToken.symbol === "USDT" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "ZAMM" as const,
      };
    }

    // Regular tokens
    const source = determineReserveSource(coinId, isCustom);
    return {
      actualPoolId: mainPoolId,
      reserveSource: source,
    };
  }, [sellToken.symbol, buyToken?.symbol, sellToken.poolId, buyToken?.poolId, coinId, isCustom, mainPoolId]);

  const { data: reserves } = useReserves({
    poolId: actualPoolId,
    source: reserveSource,
  });
  const { data: targetReserves } = useReserves({
    poolId: targetPoolId,
    source: reserveSource,
  });

  // Fetch pool info for LP supply calculation
  const poolContract = reserveSource === "COOKBOOK" ? CookbookAddress : ZAMMAddress;
  const poolAbi = reserveSource === "COOKBOOK" ? CookbookAbi : ZAMMAbi;

  const { data: poolInfo } = useReadContract({
    address: poolContract,
    abi: poolAbi,
    functionName: "pools",
    args: actualPoolId ? [actualPoolId] : undefined,
    chainId: mainnet.id,
  });

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);
  
  // Set 10% slippage for ENS pools, default for others
  useEffect(() => {
    if (sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS") {
      setSlippageBps(1000n); // 10%
    } else {
      setSlippageBps(SLIPPAGE_BPS); // Default 5%
    }
  }, [sellToken?.symbol, buyToken?.symbol]);

  // Calculate expected LP tokens whenever amounts change
  const calculateLpTokens = useCallback(
    (ethAmount: bigint, tokenAmount: bigint) => {
      if (!poolInfo || ethAmount === 0n || tokenAmount === 0n) {
        setEstimatedLpTokens("");
        setEstimatedPoolShare("");
        return;
      }

      try {
        const totalSupply = poolInfo[6] as bigint; // Total LP supply at index 6

        if (totalSupply > 0n && reserves?.reserve0 && reserves?.reserve1) {
          // From AMM: liquidity = min(mulDiv(amount0, supply, reserve0), mulDiv(amount1, supply, reserve1))
          const lpFromEth = (ethAmount * totalSupply) / reserves.reserve0;
          const lpFromToken = (tokenAmount * totalSupply) / reserves.reserve1;
          const lpTokensToMint = lpFromEth < lpFromToken ? lpFromEth : lpFromToken;

          setEstimatedLpTokens(formatUnits(lpTokensToMint, 18));

          // Calculate pool share percentage
          const newTotalSupply = totalSupply + lpTokensToMint;
          const poolShareBps = (lpTokensToMint * 10000n) / newTotalSupply;
          setEstimatedPoolShare(`${(Number(poolShareBps) / 100).toFixed(2)}%`);
        } else if (totalSupply === 0n) {
          // First liquidity provider - from AMM: liquidity = sqrt(amount0 * amount1) - MINIMUM_LIQUIDITY
          const MINIMUM_LIQUIDITY = 1000n;
          const lpTokens = sqrt(ethAmount * tokenAmount) - MINIMUM_LIQUIDITY;
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

  // Determine which AMM contract will handle the pool
  const targetAMMContract = useMemo(() => {
    if (!coinId) return ZAMMAddress; // Default fallback
    const { isCookbook } = getHelperContractInfo(coinId);
    return isCookbook ? CookbookAddress : ZAMMAddress;
  }, [coinId]);

  /* Check if user has approved the target AMM contract as operator */
  const { data: isOperator, refetch: refetchOperator } = useOperatorStatus({
    address,
    operator: targetAMMContract,
    tokenId: coinId,
  });
  const {
    allowance: usdtAllowance,
    refetchAllowance: refetchUsdtAllowance,
    approveMax: approveUsdtMax,
  } = useErc20Allowance({
    token: USDT_ADDRESS,
    spender: ZAMMAddress,
  });
  const {
    allowance: cultAllowance,
    refetchAllowance: refetchCultAllowance,
    approveMax: approveCultMax,
  } = useErc20Allowance({
    token: CULT_ADDRESS,
    spender: CookbookAddress, // CULT uses Cookbook for liquidity
  });
  const {
    allowance: ensAllowance,
    refetchAllowance: refetchEnsAllowance,
    approveMax: approveEnsMax,
  } = useErc20Allowance({
    token: ENS_ADDRESS,
    spender: CookbookAddress, // ENS uses Cookbook for liquidity
  });

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const { writeContractAsync, isPending, error: writeError } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const memoizedTokens = useMemo(() => tokens, [tokens]);

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

  useEffect(() => {
    if (tokens.length && sellToken.id === null /* ETH */) {
      // pick the ETH entry from tokens
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  // Ensure ETH is always the sell token in add liquidity mode
  useEffect(() => {
    if (tokens.length && sellToken.id !== null) {
      // If a non-ETH token is selected as sell token, swap them
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken && buyToken && sellToken.id !== null) {
        // Swap: make current sellToken the buyToken, and ETH the sellToken
        setBuyToken(sellToken);
        setSellToken(ethToken);
        // Clear amounts to avoid confusion
        setSellAmt("");
        setBuyAmt("");
      }
    }
  }, [tokens, sellToken, buyToken]);

  /* helpers to sync amounts */
  const syncFromSell = async (val: string) => {
    // Add Liquidity mode - calculate optimal token1 amount based on pool reserves
    setSellAmt(val);
    if (!canSwap || !reserves) return setBuyAmt("");

    try {
      // For add liquidity, we need to calculate the optimal ratio based on current reserves
      // Using the ZAMM formula: amount1Optimal = (amount0Desired * reserve1) / reserve0

      if (isSellETH && buyToken) {
        // ETH → Token: Calculate optimal token amount for the given ETH amount
        const ethAmount = parseEther(val || "0");

        // Check for empty pool (no liquidity yet)
        if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
          // For new pools, we can't calculate optimal ratio, user sets both amounts
          setBuyAmt("");
          return;
        }

        // Calculate optimal token amount: (ethAmount * tokenReserve) / ethReserve
        const optimalTokenAmount = (ethAmount * reserves.reserve1) / reserves.reserve0;

        // Use correct decimals for the buy token (6 for USDT, 18 for others)
        const buyTokenDecimals = buyToken?.decimals || 18;
        const formattedAmount = formatUnits(optimalTokenAmount, buyTokenDecimals);

        setBuyAmt(optimalTokenAmount === 0n ? "" : formattedAmount);

        // Calculate LP tokens
        if (ethAmount > 0n && optimalTokenAmount > 0n) {
          calculateLpTokens(ethAmount, optimalTokenAmount);
        }
      } else if (!isSellETH && buyToken?.id === null) {
        // Token → ETH: Calculate optimal ETH amount for the given token amount
        const sellTokenDecimals = sellToken?.decimals || 18;
        const tokenAmount = parseUnits(val || "0", sellTokenDecimals);

        // Check for empty pool (no liquidity yet)
        if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
          // For new pools, we can't calculate optimal ratio, user sets both amounts
          setBuyAmt("");
          return;
        }

        // Calculate optimal ETH amount: (tokenAmount * ethReserve) / tokenReserve
        const optimalEthAmount = (tokenAmount * reserves.reserve0) / reserves.reserve1;

        setBuyAmt(optimalEthAmount === 0n ? "" : formatEther(optimalEthAmount));

        // Calculate LP tokens
        if (tokenAmount > 0n && optimalEthAmount > 0n) {
          calculateLpTokens(optimalEthAmount, tokenAmount);
        }
      } else if (isCoinToCoin && targetReserves && buyToken?.id && sellToken.id) {
        // For coin-to-coin, this is more complex and not common for add liquidity
        // Clear the field to let user input manually
        setBuyAmt("");
      } else {
        // Fallback: clear the buy amount for edge cases
        setBuyAmt("");
      }
    } catch (err) {
      setBuyAmt("");
    }
  };

  const syncFromBuy = async (val: string) => {
    setBuyAmt(val);
    if (!canSwap || !reserves) return setSellAmt("");

    try {
      // For add liquidity, calculate optimal token0 amount based on pool reserves
      // Using the reverse ZAMM formula: amount0Optimal = (amount1Desired * reserve0) / reserve1

      if (isSellETH && buyToken) {
        // User input token amount, calculate optimal ETH amount
        const buyTokenDecimals = buyToken?.decimals || 18;
        const tokenAmount = parseUnits(val || "0", buyTokenDecimals);

        // Check for empty pool (no liquidity yet)
        if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
          // For new pools, we can't calculate optimal ratio, user sets both amounts
          setSellAmt("");
          return;
        }

        // Calculate optimal ETH amount: (tokenAmount * ethReserve) / tokenReserve
        const optimalEthAmount = (tokenAmount * reserves.reserve0) / reserves.reserve1;

        setSellAmt(optimalEthAmount === 0n ? "" : formatEther(optimalEthAmount));

        // Calculate LP tokens
        if (optimalEthAmount > 0n && tokenAmount > 0n) {
          calculateLpTokens(optimalEthAmount, tokenAmount);
        }
      } else if (!isSellETH && buyToken?.id === null) {
        // User input ETH amount, calculate optimal token amount
        const ethAmount = parseEther(val || "0");

        // Check for empty pool (no liquidity yet)
        if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
          // For new pools, we can't calculate optimal ratio, user sets both amounts
          setSellAmt("");
          return;
        }

        // Calculate optimal token amount: (ethAmount * tokenReserve) / ethReserve
        const optimalTokenAmount = (ethAmount * reserves.reserve1) / reserves.reserve0;

        // Use correct decimals for the sell token
        const sellTokenDecimals = sellToken?.decimals || 18;
        setSellAmt(optimalTokenAmount === 0n ? "" : formatUnits(optimalTokenAmount, sellTokenDecimals));

        // Calculate LP tokens
        if (ethAmount > 0n && optimalTokenAmount > 0n) {
          calculateLpTokens(ethAmount, optimalTokenAmount);
        }
      } else if (isCoinToCoin) {
        // For coin-to-coin add liquidity, this is complex and not common
        // Clear the field to let user input manually
        setSellAmt("");
      } else {
        // Fallback: clear the sell amount for edge cases
        setSellAmt("");
      }
    } catch (err) {
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

  const executeAddLiquidity = async () => {
    // More specific input validation to catch issues early
    if (!canSwap || !reserves || !address || !publicClient) {
      setTxError("Missing required data for transaction");
      return;
    }

    if (!sellAmt || Number.parseFloat(sellAmt) <= 0) {
      setTxError("Please enter a valid sell amount");
      return;
    }

    if (!buyAmt || Number.parseFloat(buyAmt) <= 0) {
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

      // Check if we're dealing with special tokens
      let poolKey;
      const isUsdtPool = sellToken.symbol === "USDT" || buyToken?.symbol === "USDT";
      const isUsingCult = sellToken.symbol === "CULT" || buyToken?.symbol === "CULT";
      const isUsingEns = sellToken.symbol === "ENS" || buyToken?.symbol === "ENS";

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

      // Get the amount of USDT being used
      let usdtAmount = 0n;
      if (isUsingUsdt) {
        // Determine which token is USDT and get its amount
        if ((sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS) || sellToken.symbol === "USDT") {
          usdtAmount = parseUnits(sellAmt, 6); // USDT has 6 decimals
        } else if ((buyToken?.isCustomPool && buyToken?.token1 === USDT_ADDRESS) || buyToken?.symbol === "USDT") {
          usdtAmount = parseUnits(buyAmt, 6); // USDT has 6 decimals
        }

        // Check if we need to verify USDT allowance first
        if (usdtAllowance === undefined) {
          await refetchUsdtAllowance();
        }

        // If USDT amount is greater than allowance, request approval
        if (usdtAllowance === undefined || usdtAllowance === 0n || usdtAmount > usdtAllowance) {
          // Maintain consistent UX with operator approval flow
          setTxError("Waiting for USDT approval. Please confirm the transaction...");
          const approved = await approveUsdtMax();
          if (approved === undefined) {
            return; // Stop if approval failed or was rejected
          } else {
            const receipt = await publicClient.waitForTransactionReceipt({
              hash: approved,
            });

            // Check if the transaction was successful
            if (receipt.status === "success") {
              await refetchUsdtAllowance();
            }

            return;
          }
        }
      }

      // Determine coin type and helper contract info
      const { isCookbook } = getHelperContractInfo(coinId);

      if (isUsingCult) {
        // Use the specific CULT pool key with correct id1=0n and feeOrHook
        poolKey = CULT_POOL_KEY;
      } else if (isUsingEns) {
        // Use the specific ENS pool key with correct id1=0n and feeOrHook
        poolKey = ENS_POOL_KEY;
      } else if (isUsdtPool) {
        // Use the custom pool key for USDT-ETH pool
        const customToken = sellToken.isCustomPool ? sellToken : buyToken;
        poolKey = customToken?.poolKey || USDT_POOL_KEY;
      } else if (isCookbook) {
        // Cookbook coin pool key - use CookbookAddress as token1
        poolKey = computePoolKey(coinId, SWAP_FEE, CookbookAddress);
      } else {
        // Regular pool key
        poolKey = computePoolKey(coinId) as ZAMMPoolKey;
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // In ZAMM's design, for all pools:
      // - token0 is always ETH (zeroAddress), id0 is 0
      // - token1 is always the Coin contract (or USDT for custom pool), id1 is the coinId

      // So we need to ensure:
      // - amount0 is the ETH amount (regardless of which input field the user used)
      // - amount1 is the Coin amount

      // Use correct decimals for each token directly
      const amount0 = isSellETH ? parseEther(sellAmt) : parseEther(buyAmt); // ETH amount
      const amount1 = isSellETH
        ? parseUnits(buyAmt, buyToken?.decimals || 18) // Use buyToken's actual decimals
        : parseUnits(sellAmt, sellToken?.decimals || 18); // Use sellToken's actual decimals

      // Verify we have valid amounts
      if (amount0 === 0n || amount1 === 0n) {
        setTxError("Invalid liquidity amounts");
        return;
      }

      // Slippage protection will be calculated after getting exact amounts from ZAMMHelper

      // Check for USDT approvals first if using USDT pool
      if (isUsdtPool && !isSellETH && usdtAllowance !== undefined && amount1 > usdtAllowance) {
        try {
          // First, show a notification about the approval step
          setTxError("Waiting for USDT approval. Please confirm the transaction...");

          // Send the approval transaction
          const approvalHash = await approveUsdtMax();

          // Show a waiting message
          setTxError("USDT approval submitted. Waiting for confirmation...");

          // Wait for the transaction to be mined
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });

          // Check if the transaction was successful
          if (receipt.status === "success") {
            refetchUsdtAllowance();
            setTxError(null); // Clear the message
          } else {
            setTxError("USDT approval failed. Please try again.");
            return;
          }
        } catch (err) {
          // Use our utility to handle wallet errors
          const errorMsg = handleWalletError(err, {
            defaultMessage: t("errors.transaction_error"),
          });
          if (errorMsg) {
            setTxError(errorMsg);
          }
          return;
        }
      }

      // Check for CULT ERC20 approval if needed
      if (isUsingCult) {
        const cultAmount =
          sellToken.symbol === "CULT"
            ? parseUnits(sellAmt, 18) // CULT has 18 decimals
            : parseUnits(buyAmt, 18);

        if (cultAllowance === undefined || cultAmount > cultAllowance) {
          try {
            setTxError("Waiting for CULT approval. Please confirm the transaction...");
            const approved = await approveCultMax();
            if (!approved) return;

            setTxError("CULT approval submitted. Waiting for confirmation...");
            const receipt = await publicClient.waitForTransactionReceipt({ hash: approved });

            if (receipt.status === "success") {
              await refetchCultAllowance();
              setTxError(null);
            } else {
              setTxError("CULT approval failed. Please try again.");
              return;
            }
          } catch (err) {
            const errorMsg = handleWalletError(err, {
              defaultMessage: t("errors.transaction_error"),
            });
            if (errorMsg) {
              setTxError(errorMsg);
            }
            return;
          }
        }
      }
      
      // Check for ENS ERC20 approval if needed
      if (isUsingEns) {
        const ensAmount =
          sellToken.symbol === "ENS"
            ? parseUnits(sellAmt, 18) // ENS has 18 decimals
            : parseUnits(buyAmt, 18);

        if (ensAllowance === undefined || ensAmount > ensAllowance) {
          try {
            setTxError("Waiting for ENS approval. Please confirm the transaction...");
            const approved = await approveEnsMax();
            if (!approved) return;

            setTxError("ENS approval submitted. Waiting for confirmation...");
            const receipt = await publicClient.waitForTransactionReceipt({ hash: approved });

            if (receipt.status === "success") {
              await refetchEnsAllowance();
              setTxError(null);
            } else {
              setTxError("ENS approval failed. Please try again.");
              return;
            }
          } catch (err) {
            const errorMsg = handleWalletError(err, {
              defaultMessage: t("errors.transaction_error"),
            });
            if (errorMsg) {
              setTxError(errorMsg);
            }
            return;
          }
        }
      }

      // Check if the user needs to approve the target AMM contract as operator
      // This is reflexive to the pool source:
      // - Cookbook pool: Approve CookbookAddress as operator on CoinsAddress
      // - ZAMM pool: Approve ZAMMAddress as operator on CoinsAddress
      // Only needed for ERC6909 coins, not for ERC20s like USDT/CULT/ENS
      if (!isUsdtPool && !isUsingCult && !isUsingEns && coinId && isOperator === false) {
        try {
          // First, show a notification about the approval step
          setTxError("Waiting for operator approval. Please confirm the transaction...");

          const approvalHash = await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [targetAMMContract, true],
          });

          // Show a waiting message
          setTxError("Operator approval submitted. Waiting for confirmation...");

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
          const errorMsg = handleWalletError(err, {
            defaultMessage: t("errors.transaction_error"),
          });
          if (errorMsg) {
            setTxError(errorMsg);
          }
          return;
        }
      }

      // Use appropriate ZAMMHelper contract based on coin type
      const helperAddress = isCookbook ? ZAMMHelperV1Address : ZAMMHelperAddress;
      const helperAbi = isCookbook ? ZAMMHelperV1Abi : ZAMMHelperAbi;

      try {
        // The contract call returns an array of values rather than an object
        const result = await publicClient.readContract({
          address: helperAddress,
          abi: helperAbi,
          functionName: "calculateRequiredETH",
          args: [
            poolKey as any, // Cast to any to handle union type of ZAMMPoolKey | CookbookPoolKey
            amount0, // amount0Desired
            amount1, // amount1Desired
          ],
        });

        // Extract the values from the result array
        const [ethAmount, calcAmount0, calcAmount1] = result as [bigint, bigint, bigint];

        // Detailed logging to help with debugging

        // Calculate minimum amounts based on the actual amounts that will be used by the contract
        const actualAmount0Min = withSlippage(calcAmount0, slippageBps);
        const actualAmount1Min = withSlippage(calcAmount1, slippageBps);

        // Use the ethAmount from ZAMMHelper as the exact value to send
        // IMPORTANT: We should also use the exact calculated amounts for amount0Desired and amount1Desired
        // For cookbook coins, use CookbookAddress as the ZAMM instance (V2)
        // For regular coins, use ZAMMAddress (V1)
        const targetZAMMAddress = isCookbook ? CookbookAddress : ZAMMAddress;
        const targetZAMMAbi = isCookbook ? CookbookAbi : ZAMMAbi;

        const hash = await writeContractAsync({
          address: targetZAMMAddress,
          abi: targetZAMMAbi,
          functionName: "addLiquidity",
          args: [
            poolKey as any, // Cast to any to handle union type of ZAMMPoolKey | CookbookPoolKey
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
        const errorMsg = handleWalletError(calcErr, {
          defaultMessage: t("errors.transaction_error"),
        });
        if (errorMsg) {
          setTxError(errorMsg);
        }
        return;
      }
    } catch (err) {
      // Handle errors, but don't display errors for user rejections
      // Use our utility to properly handle wallet errors
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        // More specific error messages based on error type
        if (err instanceof Error) {
          if (err.message.includes("insufficient funds")) {
            setTxError(t("errors.insufficient_funds") || "Insufficient funds for this transaction");
          } else if (err.message.includes("InvalidMsgVal")) {
            // This is our critical error where the msg.value doesn't match what the contract expects
            setTxError(
              t("errors.contract_error") || "Contract rejected ETH value. Please try again with different amounts.",
            );
          } else {
            setTxError(errorMsg);
          }
        } else {
          setTxError(errorMsg);
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

  return (
    <div className="relative flex flex-col">
      <PoolApyDisplay poolId={mainPoolId ? mainPoolId.toString() : undefined} className="mb-2" />
      {/* Provide panel */}
      <SwapPanel
        title={t("common.provide")}
        selectedToken={sellToken}
        tokens={memoizedTokens}
        onSelect={handleSellTokenSelect}
        isEthBalanceFetching={isEthBalanceFetching}
        amount={sellAmt}
        onAmountChange={syncFromSell}
        showMaxButton={!!(sellToken.balance !== undefined && sellToken.balance > 0n)}
        onMax={() => {
          if (sellToken.id === null) {
            const ethAmount = ((sellToken.balance as bigint) * 99n) / 100n;
            syncFromSell(formatEther(ethAmount));
          } else {
            const decimals = sellToken.decimals || 18;
            syncFromSell(formatUnits(sellToken.balance as bigint, decimals));
          }
        }}
        className="rounded-t-2xl pb-4"
      />

      {/* And (second) panel */}
      {buyToken && (
        <SwapPanel
          title={t("common.and")}
          selectedToken={buyToken}
          tokens={memoizedTokens}
          onSelect={handleBuyTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={buyAmt}
          onAmountChange={syncFromBuy}
          showMaxButton={!!(buyToken.balance !== undefined && buyToken.balance > 0n)}
          onMax={() => {
            if (buyToken.id === null) {
              const ethAmount = ((buyToken.balance as bigint) * 99n) / 100n;
              syncFromBuy(formatEther(ethAmount));
            } else {
              const decimals = buyToken.decimals || 18;
              syncFromBuy(formatUnits(buyToken.balance as bigint, decimals));
            }
          }}
          className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
        />
      )}

      <NetworkError message="manage liquidity" />

      {/* Slippage information */}
      <SlippageSettings slippageBps={slippageBps} setSlippageBps={setSlippageBps} />

      {/* LP Tokens and Pool Share Estimation */}
      {estimatedLpTokens && estimatedPoolShare && (
        <div className="mt-2 p-3 bg-muted/30 border border-primary/20 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-muted-foreground">{t("common.estimated_lp_tokens")}:</span>
            <span className="font-mono text-sm">{formatNumber(parseFloat(estimatedLpTokens), 6)} LP</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">{t("cult.pool_share")}:</span>
            <span className="font-mono text-sm">{estimatedPoolShare}</span>
          </div>
        </div>
      )}

      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground dark:text-gray-300">
        <p className="font-medium mb-1">{t("pool.adding_liquidity_provides")}</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.lp_tokens_proof")}</li>
          <li>{t("pool.earn_fees_from_trades", { fee: Number(SWAP_FEE) / 100 })}</li>
          <li>{t("pool.withdraw_anytime")}</li>
        </ul>
      </div>

      <button
        onClick={executeAddLiquidity}
        disabled={!isConnected || isPending}
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
          ${
            !isConnected || isPending
              ? "opacity-50 cursor-not-allowed"
              : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
          }
        `}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.adding_liquidity")}
          </span>
        ) : (
          t("pool.add")
        )}
      </button>

      {/* Status and error messages */}
      {txError && txError.includes("Waiting for") && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
          {txError}
        </div>
      )}

      {((writeError && !isUserRejectionError(writeError)) || (txError && !txError.includes("Waiting for"))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError) ? writeError.message : txError}
        </div>
      )}

      {isSuccess && <SuccessMessage />}
    </div>
  );
};
