import { Loader2 } from "lucide-react";
import {
  CookbookPoolKey,
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
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import {
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { ZAMMAbi, ZAMMAddress } from "./constants/ZAAM";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import { useWaitForTransactionReceipt } from "wagmi";
import {
  TokenMeta,
  USDT_ADDRESS,
  USDT_POOL_KEY,
  CULT_ADDRESS,
  CULT_POOL_KEY,
  ENS_ADDRESS,
  ENS_POOL_KEY,
  WLFI_ADDRESS,
  WLFI_POOL_KEY,
} from "./lib/coins";
import { useTokenSelection } from "./contexts/TokenSelectionContext";
import {
  determineReserveSource,
  getHelperContractInfo,
} from "./lib/coin-utils";
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

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
  const publicClient = usePublicClient({ chainId });
  const { tokens, isEthBalanceFetching } = useAllCoins();
  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  /* State */
  const [sellAmt, setSellAmt] = useState("");
  const [buyAmt, setBuyAmt] = useState("");
  const [estimatedLpTokens, setEstimatedLpTokens] = useState<string>("");
  const [estimatedPoolShare, setEstimatedPoolShare] = useState<string>("");

  // Use shared token selection context
  const { sellToken, buyToken, setSellToken, setBuyToken } =
    useTokenSelection();
  const { isSellETH, isCustom, isCoinToCoin, coinId, canSwap } = useMemo(
    () => analyzeTokens(sellToken, buyToken),
    [sellToken, buyToken],
  );

  /* Calculate pool reserves */
  const { mainPoolId } = getPoolIds(
    {
      ...sellToken,
      swapFee: slippageBps === null ? undefined : slippageBps,
    },
    buyToken !== null
      ? {
          ...buyToken,
          swapFee: slippageBps === null ? undefined : slippageBps,
        }
      : null,
    {
      isCustomPool: isCustom,
      isCoinToCoin: isCoinToCoin,
    },
  );

  // Simple direct handling for CULT, ENS, WLFI and other custom pools
  const { actualPoolId, reserveSource } = useMemo(() => {
    if (sellToken.symbol === "CULT" || buyToken?.symbol === "CULT") {
      return {
        actualPoolId:
          sellToken.symbol === "CULT" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "COOKBOOK" as const,
      };
    }
    if (sellToken.symbol === "ENS" || buyToken?.symbol === "ENS") {
      return {
        actualPoolId:
          sellToken.symbol === "ENS" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "COOKBOOK" as const,
      };
    }

    // Direct WLFI handling
    if (sellToken.symbol === "WLFI" || buyToken?.symbol === "WLFI") {
      return {
        actualPoolId: sellToken.symbol === "WLFI" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "COOKBOOK" as const,
      };
    }

    // USDT handling
    if (sellToken.symbol === "USDT" || buyToken?.symbol === "USDT") {
      return {
        actualPoolId:
          sellToken.symbol === "USDT" ? sellToken.poolId : buyToken?.poolId,
        reserveSource: "ZAMM" as const,
      };
    }

    // Fallback to existing heuristic for ERC6909/ZAMM/COOKBOOK
    const source = determineReserveSource(coinId, isCustom);
    return { actualPoolId: mainPoolId, reserveSource: source };
  }, [
    sellToken.symbol,
    buyToken?.symbol,
    sellToken.poolId,
    buyToken?.poolId,
    coinId,
    isCustom,
    mainPoolId,
  ]);

  const { data: reserves } = useReserves({
    poolId: actualPoolId,
    source: reserveSource,
  });

  // Pool info for LP supply calculation
  const poolContract =
    reserveSource === "COOKBOOK" ? CookbookAddress : ZAMMAddress;
  const poolAbi = reserveSource === "COOKBOOK" ? CookbookAbi : ZAMMAbi;

  const { data: poolInfo } = useReadContract({
    address: poolContract,
    abi: poolAbi,
    functionName: "pools",
    args: actualPoolId ? [actualPoolId] : undefined,
    chainId: mainnet.id,
  });

  const [slippageBps, setSlippageBps] = useState<bigint>(SLIPPAGE_BPS);

  // Set 10% slippage for ENS and WLFI pools, default for others
  useEffect(() => {
    if (sellToken?.symbol === "ENS" || buyToken?.symbol === "ENS" || 
        sellToken?.symbol === "WLFI" || buyToken?.symbol === "WLFI") {
      setSlippageBps(1000n); // 10%
    } else {
      setSlippageBps(SLIPPAGE_BPS);
    }
  }, [sellToken?.symbol, buyToken?.symbol]);

  // [NEW: ERC20 detection] -----------------------------------------------
  const isErc20Pool = useMemo(
    () => sellToken.source === "ERC20" || buyToken?.source === "ERC20",
    [sellToken.source, buyToken?.source],
  );

  const erc20Meta: TokenMeta | undefined = useMemo(() => {
    if (sellToken.source === "ERC20") return sellToken;
    if (buyToken?.source === "ERC20") return buyToken;
    return undefined;
  }, [sellToken, buyToken]);

  console.log("ERC20META:", erc20Meta);
  // [NEW: ERC20 allowance hook (generic)] --------------------------------
  const {
    allowance: genericErc20Allowance,
    refetchAllowance: refetchGenericErc20Allowance,
    approveMax: approveGenericErc20Max,
  } = useErc20Allowance({
    token: erc20Meta?.token1 == undefined ? zeroAddress : erc20Meta.token1,
    spender: ZAMMAddress, // spender is ZAMM for ERC-20 pools
  });

  // Operator status (ERC6909 only)
  const { data: isOperator, refetch: refetchOperator } = useOperatorStatus({
    address,
    operator: ZAMMAddress, // will only be used for ERC6909 later
    tokenId: coinId,
  });

  // USDT/CULT/ENS allowances (existing)
  const {
    allowance: usdtAllowance,
    refetchAllowance: refetchUsdtAllowance,
    approveMax: approveUsdtMax,
  } = useErc20Allowance({ token: USDT_ADDRESS, spender: ZAMMAddress });

  const {
    allowance: cultAllowance,
    refetchAllowance: refetchCultAllowance,
    approveMax: approveCultMax,
  } = useErc20Allowance({ token: CULT_ADDRESS, spender: CookbookAddress });

  const {
    allowance: ensAllowance,
    refetchAllowance: refetchEnsAllowance,
    approveMax: approveEnsMax,
  } = useErc20Allowance({
    token: ENS_ADDRESS,
    spender: CookbookAddress, // ENS uses Cookbook for liquidity
  });
  const {
    allowance: wlfiAllowance,
    refetchAllowance: refetchWlfiAllowance,
    approveMax: approveWlfiMax,
  } = useErc20Allowance({
    token: WLFI_ADDRESS,
    spender: CookbookAddress, // WLFI uses Cookbook for liquidity
  });

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // Reset UI when tokens change
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
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
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken) setSellToken(ethToken);
    }
  }, [tokens]);

  // Ensure ETH is always the sell token in add liquidity mode
  useEffect(() => {
    if (tokens.length && sellToken.id !== null) {
      const ethToken = tokens.find((t) => t.id === null);
      if (ethToken && buyToken && sellToken.id !== null) {
        setBuyToken(sellToken);
        setSellToken(ethToken);
        setSellAmt("");
        setBuyAmt("");
      }
    }
  }, [tokens, sellToken, buyToken]);

  /* LP estimation */
  const calculateLpTokens = useCallback(
    (ethAmount: bigint, tokenAmount: bigint) => {
      if (!poolInfo || ethAmount === 0n || tokenAmount === 0n) {
        setEstimatedLpTokens("");
        setEstimatedPoolShare("");
        return;
      }

      try {
        const totalSupply = poolInfo[6] as bigint; // LP total supply index

        if (totalSupply > 0n && reserves?.reserve0 && reserves?.reserve1) {
          const lpFromEth = (ethAmount * totalSupply) / reserves.reserve0;
          const lpFromToken = (tokenAmount * totalSupply) / reserves.reserve1;
          const lpTokensToMint =
            lpFromEth < lpFromToken ? lpFromEth : lpFromToken;

          setEstimatedLpTokens(formatUnits(lpTokensToMint, 18));

          const newTotalSupply = totalSupply + lpTokensToMint;
          const poolShareBps = (lpTokensToMint * 10000n) / newTotalSupply;
          setEstimatedPoolShare(`${(Number(poolShareBps) / 100).toFixed(2)}%`);
        } else if (totalSupply === 0n) {
          const MINIMUM_LIQUIDITY = 1000n;
          const lpTokens = sqrt(ethAmount * tokenAmount) - MINIMUM_LIQUIDITY;
          setEstimatedLpTokens(formatUnits(lpTokens, 18));
          setEstimatedPoolShare("100%");
        }
      } catch (err) {
        setEstimatedLpTokens("");
        setEstimatedPoolShare("");
      }
    },
    [poolInfo, reserves],
  );

  /* AMM / Helper selection
     - ERC20 pools => ZAMM + ZAMMHelper
     - Cookbook coins => Cookbook + ZAMMHelperV1
     - ERC6909 ZAMM => ZAMM + ZAMMHelper
  */
  const { isCookbook } = useMemo(() => getHelperContractInfo(coinId), [coinId]);

  const targetAMMContract = isErc20Pool
    ? ZAMMAddress
    : isCookbook
      ? CookbookAddress
      : ZAMMAddress;

  const targetAMMAbi = isErc20Pool
    ? ZAMMAbi
    : isCookbook
      ? CookbookAbi
      : ZAMMAbi;

  const helperAddress = isErc20Pool
    ? ZAMMHelperAddress
    : isCookbook
      ? ZAMMHelperV1Address
      : ZAMMHelperAddress;

  const helperAbi = isErc20Pool
    ? ZAMMHelperAbi
    : isCookbook
      ? ZAMMHelperV1Abi
      : ZAMMHelperAbi;

  /* helpers to sync amounts */
  const syncFromSell = useCallback(
    async (val: string) => {
      setSellAmt(val);
      console.log("syncFromSell", {
        val,
        canSwap,
        reserves,
      });
      if (!canSwap || !reserves) return setBuyAmt("");

      try {
        if (isSellETH && buyToken) {
          const ethAmount = parseEther(val || "0");
          if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
            setBuyAmt("");
            return;
          }
          const optimalTokenAmount =
            (ethAmount * reserves.reserve1) / reserves.reserve0;
          const buyTokenDecimals = buyToken?.decimals || 18;
          const formattedAmount = formatUnits(
            optimalTokenAmount,
            buyTokenDecimals,
          );
          setBuyAmt(optimalTokenAmount === 0n ? "" : formattedAmount);

          if (ethAmount > 0n && optimalTokenAmount > 0n) {
            calculateLpTokens(ethAmount, optimalTokenAmount);
          }
        } else if (!isSellETH && buyToken?.id === null) {
          const sellTokenDecimals = sellToken?.decimals || 18;
          const tokenAmount = parseUnits(val || "0", sellTokenDecimals);
          if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
            setBuyAmt("");
            return;
          }
          const optimalEthAmount =
            (tokenAmount * reserves.reserve0) / reserves.reserve1;
          setBuyAmt(
            optimalEthAmount === 0n ? "" : formatEther(optimalEthAmount),
          );

          if (tokenAmount > 0n && optimalEthAmount > 0n) {
            calculateLpTokens(optimalEthAmount, tokenAmount);
          }
        } else if (isCoinToCoin && buyToken?.id && sellToken.id) {
          setBuyAmt("");
        } else {
          setBuyAmt("");
        }
      } catch {
        setBuyAmt("");
      }
    },
    [
      canSwap,
      reserves,
      isSellETH,
      buyToken,
      sellToken,
      calculateLpTokens,
      isCoinToCoin,
    ],
  );

  const syncFromBuy = useCallback(
    async (val: string) => {
      setBuyAmt(val);
      console.log("syncFromBuy", {
        val,
        canSwap,
        reserves,
      });
      if (!canSwap || !reserves) return setSellAmt("");

      try {
        if (isSellETH && buyToken) {
          const buyTokenDecimals = buyToken?.decimals || 18;
          const tokenAmount = parseUnits(val || "0", buyTokenDecimals);
          if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
            setSellAmt("");
            return;
          }
          const optimalEthAmount =
            (tokenAmount * reserves.reserve0) / reserves.reserve1;
          setSellAmt(
            optimalEthAmount === 0n ? "" : formatEther(optimalEthAmount),
          );

          if (optimalEthAmount > 0n && tokenAmount > 0n) {
            calculateLpTokens(optimalEthAmount, tokenAmount);
          }
        } else if (!isSellETH && buyToken?.id === null) {
          const ethAmount = parseEther(val || "0");
          if (reserves.reserve0 === 0n || reserves.reserve1 === 0n) {
            setSellAmt("");
            return;
          }
          const optimalTokenAmount =
            (ethAmount * reserves.reserve1) / reserves.reserve0;
          const sellTokenDecimals = sellToken?.decimals || 18;
          setSellAmt(
            optimalTokenAmount === 0n
              ? ""
              : formatUnits(optimalTokenAmount, sellTokenDecimals),
          );

          if (ethAmount > 0n && optimalTokenAmount > 0n) {
            calculateLpTokens(ethAmount, optimalTokenAmount);
          }
        } else if (isCoinToCoin) {
          setSellAmt("");
        } else {
          setSellAmt("");
        }
      } catch {
        setSellAmt("");
      }
    },
    [
      canSwap,
      reserves,
      isSellETH,
      buyToken,
      sellToken,
      calculateLpTokens,
      isCoinToCoin,
    ],
  );

  const handleBuyTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setSellAmt("");
      setBuyAmt("");
      setBuyToken(token);
    },
    [txError],
  );

  const { isCookbook: _ignore } = getHelperContractInfo(coinId); // keep memoization parity

  const executeAddLiquidity = async () => {
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
      if (chainId !== mainnet.id) {
        setTxError("Please connect to Ethereum mainnet to perform this action");
        return;
      }

      // Check if we're dealing with special tokens
      let poolKey;
      const isUsdtPool = sellToken.symbol === "USDT" || buyToken?.symbol === "USDT";
      const isUsingCult = sellToken.symbol === "CULT" || buyToken?.symbol === "CULT";
      const isUsingEns = sellToken.symbol === "ENS" || buyToken?.symbol === "ENS";
      const isUsingWlfi = sellToken.symbol === "WLFI" || buyToken?.symbol === "WLFI";

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
        
      // ---------- poolKey selection ----------
      let poolKey: ZAMMPoolKey | CookbookPoolKey;

      if (isUsingCult) {
        poolKey = CULT_POOL_KEY;
      } else if (isUsingEns) {
        poolKey = ENS_POOL_KEY;
      } else if (isUsingWlfi) {
        // Use the specific WLFI pool key with correct id1=0n and feeOrHook
        poolKey = WLFI_POOL_KEY;
      } else if (isUsdtPool) {
        const customToken = sellToken.isCustomPool ? sellToken : buyToken!;
        poolKey = customToken.poolKey ?? USDT_POOL_KEY;
      } else if (isErc20Pool) {
        // [NEW: ERC20 pool key]
        const meta = erc20Meta!;
        poolKey =
          meta.poolKey ??
          ({
            id0: 0n,
            id1: 0n, // ERC-20 pools typically use id1=0n
            token0: ZERO_ADDRESS,
            token1: meta.token1!, // ERC-20 address
            swapFee: meta.swapFee ?? SWAP_FEE,
          } as ZAMMPoolKey);
      } else if (isCookbook) {
        poolKey = computePoolKey(
          coinId,
          SWAP_FEE,
          CookbookAddress,
        ) as CookbookPoolKey;
      } else {
        poolKey = computePoolKey(coinId) as ZAMMPoolKey;
      }

      const deadline = nowSec() + BigInt(DEADLINE_SEC);

      // Amount mapping: token0 = ETH, token1 = coin/erc20
      const amount0 = isSellETH ? parseEther(sellAmt) : parseEther(buyAmt);
      const token1Decimals =
        (isErc20Pool
          ? erc20Meta?.decimals
          : isUsdtPool
            ? 6
            : isUsingCult || isUsingEns
              ? 18
              : buyToken?.decimals) ?? 18;

      const amount1 = isSellETH
        ? parseUnits(buyAmt, token1Decimals)
        : parseUnits(sellAmt, token1Decimals);

      if (amount0 === 0n || amount1 === 0n) {
        setTxError("Invalid liquidity amounts");
        return;
      }

      // Balance checks
      const ethRequired = amount0;
      const ethAvailable =
        sellToken.id === null
          ? sellToken.balance || 0n
          : buyToken?.balance || 0n;
      if (ethAvailable < ethRequired) {
        setTxError("Insufficient ETH balance");
        return;
      }

      // token1 balance
      let tokenAvailable = 0n;
      if (isUsdtPool) {
        tokenAvailable = isSellETH
          ? buyToken?.balance || 0n
          : sellToken.balance || 0n;
      } else if (isUsingCult) {
        tokenAvailable =
          sellToken.symbol === "CULT"
            ? sellToken.balance || 0n
            : buyToken?.balance || 0n;
      } else if (isUsingEns) {
        tokenAvailable = sellToken.symbol === "ENS" ? sellToken.balance || 0n : buyToken?.balance || 0n;
      } else if (isUsingWlfi) {
        tokenAvailable = sellToken.symbol === "WLFI" ? sellToken.balance || 0n : buyToken?.balance || 0n;
      } else {
        tokenAvailable = isSellETH
          ? buyToken?.balance || 0n
          : sellToken.balance || 0n;
      }
      if (tokenAvailable < amount1) {
        const tokenSymbol = isUsdtPool
          ? "USDT"
          : isUsingCult
            ? "CULT"
            : isUsingEns
              ? "ENS"
              : isUsingWlfi
                ? "WLFI"
              : isSellETH
                ? buyToken?.symbol
                : sellToken.symbol;
        setTxError(`Insufficient ${tokenSymbol} balance`);
        return;
      }

      // ---------- Approvals ----------
      // USDT
      if (isUsdtPool) {
        const usdtAmount =
          sellToken.symbol === "USDT" ||
          (sellToken.isCustomPool && sellToken.token1 === USDT_ADDRESS)
            ? parseUnits(sellAmt, 6)
            : parseUnits(buyAmt, 6);

        if (usdtAllowance === undefined) await refetchUsdtAllowance();
        if (usdtAllowance === undefined || usdtAllowance < usdtAmount) {
          try {
            setTxError(
              "Waiting for USDT approval. Please confirm the transaction...",
            );
            const hash = await approveUsdtMax();
            if (!hash) return;
            setTxError("USDT approval submitted. Waiting for confirmation...");
            const r = await publicClient.waitForTransactionReceipt({ hash });
            if (r.status === "success") {
              await refetchUsdtAllowance();
              setTxError(null);
            } else {
              setTxError("USDT approval failed. Please try again.");
              return;
            }
          } catch (err) {
            const msg = handleWalletError(err, {
              defaultMessage: t("errors.transaction_error"),
            });
            if (msg) setTxError(msg);
            return;
          }
        }
      }

      // CULT
      if (isUsingCult) {
        const cultAmount =
          sellToken.symbol === "CULT"
            ? parseUnits(sellAmt, 18)
            : parseUnits(buyAmt, 18);
        if (cultAllowance === undefined || cultAllowance < cultAmount) {
          try {
            setTxError(
              "Waiting for CULT approval. Please confirm the transaction...",
            );
            const hash = await approveCultMax();
            if (!hash) return;
            setTxError("CULT approval submitted. Waiting for confirmation...");
            const r = await publicClient.waitForTransactionReceipt({ hash });
            if (r.status === "success") {
              await refetchCultAllowance();
              setTxError(null);
            } else {
              setTxError("CULT approval failed. Please try again.");
              return;
            }
          } catch (err) {
            const msg = handleWalletError(err, {
              defaultMessage: t("errors.transaction_error"),
            });
            if (msg) setTxError(msg);
            return;
          }
        }
      }

      // ENS
      if (isUsingEns) {
        const ensAmount =
          sellToken.symbol === "ENS"
            ? parseUnits(sellAmt, 18)
            : parseUnits(buyAmt, 18);
        if (ensAllowance === undefined || ensAllowance < ensAmount) {
          try {
            setTxError(
              "Waiting for ENS approval. Please confirm the transaction...",
            );
            const hash = await approveEnsMax();
            if (!hash) return;
            setTxError("ENS approval submitted. Waiting for confirmation...");
            const r = await publicClient.waitForTransactionReceipt({ hash });
            if (r.status === "success") {
              await refetchEnsAllowance();
              setTxError(null);
            } else {
              setTxError("ENS approval failed. Please try again.");
              return;
            }
          } catch (err) {
            const msg = handleWalletError(err, {
              defaultMessage: t("errors.transaction_error"),
            });
            if (msg) setTxError(msg);
            return;
          }
        }
      }

      // [NEW: Generic ERC20 approvals (e.g., WLF)]
      if (isErc20Pool) {
        const erc20Amount =
          sellToken.source === "ERC20"
            ? parseUnits(sellAmt, erc20Meta?.decimals ?? 18)
            : parseUnits(buyAmt, erc20Meta?.decimals ?? 18);

        if (genericErc20Allowance === undefined) {
          await refetchGenericErc20Allowance();
        }
        if (
          genericErc20Allowance === undefined ||
          genericErc20Allowance < erc20Amount
        ) {
          try {
            setTxError(
              "Waiting for ERC-20 approval. Please confirm the transaction...",
            );
            const hash = await approveGenericErc20Max();
            if (!hash) return;

            setTxError(
              "ERC-20 approval submitted. Waiting for confirmation...",
            );
            const r = await publicClient.waitForTransactionReceipt({ hash });
            if (r.status === "success") {
              await refetchGenericErc20Allowance();
              setTxError(null);
            } else {
              setTxError("ERC-20 approval failed. Please try again.");
              return;
            }
          } catch (err) {
            const msg = handleWalletError(err, {
              defaultMessage: t("errors.transaction_error"),
            });
            if (msg) setTxError(msg);
            return;
          }
        }
      }

      // Check for WLFI ERC20 approval if needed
      if (isUsingWlfi) {
        const wlfiAmount =
          sellToken.symbol === "WLFI"
            ? parseUnits(sellAmt, 18) // WLFI has 18 decimals
            : parseUnits(buyAmt, 18);

        if (wlfiAllowance === undefined || wlfiAmount > wlfiAllowance) {
          try {
            setTxError("Waiting for WLFI approval. Please confirm the transaction...");
            const approved = await approveWlfiMax();
            if (!approved) return;

            setTxError("WLFI approval submitted. Waiting for confirmation...");
            const receipt = await publicClient.waitForTransactionReceipt({ hash: approved });

            if (receipt.status === "success") {
              await refetchWlfiAllowance();
              setTxError(null);
            } else {
              setTxError("WLFI approval failed. Please try again.");
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
      // - Cookbook pool: No approval needed - cookbook coins are permissionless
      // - ZAMM pool: Approve ZAMMAddress as operator on CoinsAddress
      // Only needed for ERC6909 coins, not for ERC20s like USDT/CULT/ENS/WLFI
      // Skip operator approval for cookbook coins (graduated zCurve coins)
      if (!isUsdtPool && !isUsingCult && !isUsingEns && !isUsingWlfi && coinId && !isCookbook && isOperator === false) {
        try {
          setTxError(
            "Waiting for operator approval. Please confirm the transaction...",
          );
          const approvalHash = await writeContractAsync({
            address: CoinsAddress,
            abi: CoinsAbi,
            functionName: "setOperator",
            args: [targetAMMContract, true],
          });
          setTxError(
            "Operator approval submitted. Waiting for confirmation...",
          );
          const r = await publicClient.waitForTransactionReceipt({
            hash: approvalHash,
          });
          if (r.status === "success") {
            await refetchOperator();
            setTxError(null);
          } else {
            setTxError("Operator approval failed. Please try again.");
            return;
          }
        } catch (err) {
          const msg = handleWalletError(err, {
            defaultMessage: t("errors.transaction_error"),
          });
          if (msg) setTxError(msg);
          return;
        }
      }

      // ---------- Helper quote & addLiquidity ----------
      try {
        const result = await publicClient.readContract({
          address: helperAddress,
          abi: helperAbi,
          functionName: "calculateRequiredETH",
          args: [poolKey as any, amount0, amount1],
        });

        const [ethAmount, calcAmount0, calcAmount1] = result as [
          bigint,
          bigint,
          bigint,
        ];

        const actualAmount0Min = withSlippage(calcAmount0, slippageBps);
        const actualAmount1Min = withSlippage(calcAmount1, slippageBps);

        const hash = await writeContractAsync({
          address: targetAMMContract,
          abi: targetAMMAbi,
          functionName: "addLiquidity",
          args: [
            poolKey as any,
            calcAmount0,
            calcAmount1,
            actualAmount0Min,
            actualAmount1Min,
            address,
            deadline,
          ],
          value: ethAmount,
        });

        setTxHash(hash);
      } catch (calcErr) {
        const errorMsg = handleWalletError(calcErr, {
          defaultMessage: t("errors.transaction_error"),
        });
        if (errorMsg) setTxError(errorMsg);
        return;
      }
    } catch (err) {
      const errorMsg = handleWalletError(err, {
        defaultMessage: t("errors.transaction_error"),
      });
      if (errorMsg) {
        if (err instanceof Error) {
          if (err.message.includes("insufficient funds")) {
            setTxError(
              t("errors.insufficient_funds") ||
                "Insufficient funds for this transaction",
            );
          } else if (err.message.includes("InvalidMsgVal")) {
            setTxError(
              t("errors.contract_error") ||
                "Contract rejected ETH value. Please try again with different amounts.",
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

  // Enhanced token selection handlers
  const handleSellTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setSellAmt("");
      setBuyAmt("");
      setSellToken(token);
    },
    [txError],
  );

  return (
    <div className="relative flex flex-col">
      <PoolApyDisplay
        poolId={mainPoolId ? mainPoolId.toString() : undefined}
        className="mb-2"
      />

      <SwapPanel
        title={t("common.provide")}
        selectedToken={sellToken}
        tokens={memoizedTokens}
        onSelect={handleSellTokenSelect}
        isEthBalanceFetching={isEthBalanceFetching}
        amount={sellAmt}
        onAmountChange={syncFromSell}
        showMaxButton={
          !!(sellToken.balance !== undefined && sellToken.balance > 0n)
        }
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

      {buyToken && (
        <SwapPanel
          title={t("common.and")}
          selectedToken={buyToken}
          tokens={memoizedTokens}
          onSelect={handleBuyTokenSelect}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={buyAmt}
          onAmountChange={syncFromBuy}
          showMaxButton={
            !!(buyToken.balance !== undefined && buyToken.balance > 0n)
          }
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
      <SlippageSettings
        slippageBps={slippageBps}
        setSlippageBps={setSlippageBps}
      />

      {estimatedLpTokens && estimatedPoolShare && (
        <div className="mt-2 p-3 bg-muted/30 border border-primary/20 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm text-muted-foreground">
              {t("common.estimated_lp_tokens")}:
            </span>
            <span className="font-mono text-sm">
              {formatNumber(parseFloat(estimatedLpTokens), 6)} LP
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {t("cult.pool_share")}:
            </span>
            <span className="font-mono text-sm">{estimatedPoolShare}</span>
          </div>
        </div>
      )}

      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground dark:text-gray-300">
        <p className="font-medium mb-1">
          {t("pool.adding_liquidity_provides")}
        </p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>{t("pool.lp_tokens_proof")}</li>
          <li>
            {t("pool.earn_fees_from_trades", { fee: Number(SWAP_FEE) / 100 })}
          </li>
          <li>{t("pool.withdraw_anytime")}</li>
        </ul>
      </div>

      <button
        onClick={executeAddLiquidity}
        disabled={
          !isConnected ||
          isPending ||
          !sellAmt ||
          !buyAmt ||
          parseFloat(sellAmt) === 0 ||
          parseFloat(buyAmt) === 0
        }
        className={`mt-2 button text-base px-8 py-4 bg-primary text-primary-foreground font-bold rounded-lg transform transition-all duration-200
          ${
            !isConnected ||
            isPending ||
            !sellAmt ||
            !buyAmt ||
            parseFloat(sellAmt) === 0 ||
            parseFloat(buyAmt) === 0
              ? "opacity-50 cursor-not-allowed"
              : "opacity-100 hover:scale-105 hover:shadow-lg focus:ring-4 focus:ring-primary/50 focus:outline-none"
          }`}
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

      {txError && txError.includes("Waiting for") && (
        <div className="text-sm text-primary mt-2 flex items-center bg-background/50 p-2 rounded border border-primary/20">
          <Loader2 className="h-3 w-3 animate-spin mr-2" />
          {txError}
        </div>
      )}

      {((writeError && !isUserRejectionError(writeError)) ||
        (txError && !txError.includes("Waiting for"))) && (
        <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20">
          {writeError && !isUserRejectionError(writeError)
            ? writeError.message
            : txError}
        </div>
      )}

      {isSuccess && <SuccessMessage />}
    </div>
  );
};
