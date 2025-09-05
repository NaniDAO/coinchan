import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatEther,
  formatUnits,
  parseEther,
  parseUnits,
  zeroAddress,
} from "viem";
import { mainnet } from "viem/chains";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { useWaitForTransactionReceipt } from "wagmi";
import { NetworkError } from "./components/NetworkError";
import { SuccessMessage } from "./components/SuccessMessage";
import { SwapPanel } from "./components/SwapPanel";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useErc20Allowance } from "./hooks/use-erc20-allowance";
import { useOperatorStatus } from "./hooks/use-operator-status";
import { ETH_TOKEN, type TokenMeta } from "./lib/coins";
import { handleWalletError, isUserRejectionError } from "./lib/errors";
import type { CookbookPoolKey } from "./lib/swap";
import { nowSec } from "./lib/utils";

interface FeeSettingsProps {
  feeBps: bigint;
  setFeeBps: (value: bigint) => void;
  className?: string;
}

const FeeSettings = ({
  feeBps,
  setFeeBps,
  className = "",
}: FeeSettingsProps) => {
  const [showFeeSettings, setShowFeeSettings] = useState(false);

  return (
    <div
      onClick={() => setShowFeeSettings(!showFeeSettings)}
      className={`text-xs mt-1 px-2 py-1 bg-primary/5 border border-primary/20 rounded text-primary cursor-pointer hover:bg-primary/10 transition-colors ${className}`}
    >
      <div className="flex justify-between items-center">
        <span>
          <strong>Pool Fee:</strong> {Number(feeBps) / 100}%
        </span>
        <span className="text-xs text-foreground-secondary">
          {showFeeSettings ? "▲" : "▼"}
        </span>
      </div>

      {showFeeSettings && (
        <div
          className="mt-2 p-2 bg-primary-background border border-accent rounded-md shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-2">
            <div className="flex gap-1 flex-wrap">
              {FEE_OPTIONS.map((option) => (
                <button
                  key={option.value.toString()}
                  onClick={() => setFeeBps(option.value)}
                  className={`px-2 py-1 text-xs rounded ${
                    feeBps === option.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-primary/50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <div className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-secondary/70 text-foreground">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  max="99"
                  step="0.01"
                  placeholder=""
                  className="w-12 bg-transparent outline-none text-center"
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value);
                    if (isNaN(value) || value < 0.01 || value > 99) return;
                    const bps = BigInt(Math.floor(value * 100));
                    setFeeBps(bps);
                  }}
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper: pool key for Cookbook pools
const createCookbookPoolKey = (
  tokenA: TokenMeta,
  tokenB: TokenMeta,
  feeBps: bigint,
): CookbookPoolKey => {
  // Handle ETH-Token pairs
  if (tokenA.id === null) {
    const tokenAddress =
      tokenB.source === "ZAMM" ? CoinsAddress : CookbookAddress;
    return {
      id0: 0n,
      id1: BigInt(tokenB.id || 0),
      token0: zeroAddress,
      token1: tokenAddress,
      feeOrHook: feeBps,
    };
  } else if (tokenB.id === null) {
    const tokenAddress =
      tokenA.source === "ZAMM" ? CoinsAddress : CookbookAddress;
    return {
      id0: 0n,
      id1: BigInt(tokenA.id || 0),
      token0: zeroAddress,
      token1: tokenAddress,
      feeOrHook: feeBps,
    };
  } else {
    // Token-token pair
    const [token0, token1] =
      tokenA.id! < tokenB.id! ? [tokenA, tokenB] : [tokenB, tokenA];
    const token0Address =
      token0.source === "ZAMM" ? CoinsAddress : CookbookAddress;
    const token1Address =
      token1.source === "ZAMM" ? CoinsAddress : CookbookAddress;

    return {
      id0: BigInt(token0.id || 0),
      id1: BigInt(token1.id || 0),
      token0: token0Address,
      token1: token1Address,
      feeOrHook: feeBps,
    };
  }
};

// Helper: which tokens need operator approval
const needsOperatorApproval = (token: TokenMeta): boolean =>
  token.source === "ZAMM";

// Helper: is ERC20 (externally standard ERC-20 that uses approve/allowance)
const isErc20 = (t?: TokenMeta | null): t is TokenMeta =>
  !!t && t.source === "ERC20";

// Helper: extract an address for an ERC-20 TokenMeta
// Prefer token1 (commonly the ERC-20 side in custom pools), fallback to token0 if non-zero.
const getErc20Address = (t?: TokenMeta | null): `0x${string}` | undefined => {
  if (!isErc20(t)) return undefined;
  const a1 = t.token1;
  const a0 = t.token0;
  if (a1 && a1 !== zeroAddress) return a1;
  if (a0 && a0 !== zeroAddress) return a0;
  return undefined;
};

export const CreatePool = () => {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId });
  const { tokens, isEthBalanceFetching } = useAllCoins();

  // State
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");
  const [token0, setToken0] = useState<TokenMeta>(ETH_TOKEN);
  const [token1, setToken1] = useState<TokenMeta | null>(null);
  const [feeBps, setFeeBps] = useState<bigint>(30n); // Default 0.3%

  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);
  const {
    writeContractAsync,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Check operator status for ZAMM (Coins) contract
  const { data: isOperator, refetch: refetchOperator } = useOperatorStatus({
    address,
    operator: CookbookAddress,
  });

  // ----- Generic ERC-20 allowances (one per side) -----
  const token0Address = getErc20Address(token0);
  const token1Address = getErc20Address(token1 || undefined);

  const {
    allowance: allowance0,
    refetchAllowance: refetch0,
    approveMax: approve0,
  } = useErc20Allowance({
    token: token0Address ?? zeroAddress,
    spender: CookbookAddress,
  });

  const {
    allowance: allowance1,
    refetchAllowance: refetch1,
    approveMax: approve1,
  } = useErc20Allowance({
    token: token1Address ?? zeroAddress,
    spender: CookbookAddress,
  });

  const memoizedTokens = useMemo(() => tokens, [tokens]);

  // Reset state when tokens change
  useEffect(() => {
    setTxHash(undefined);
    setTxError(null);
    setAmount0("");
    setAmount1("");
  }, [token0.id, token1?.id]);

  // Set default token1 when tokens load
  useEffect(() => {
    if (!token1 && tokens.length > 1) {
      setToken1(tokens[1]);
    }
  }, [tokens, token1]);

  const executeCreatePool = async () => {
    if (!token0 || !token1 || !address || !publicClient) {
      setTxError("Missing required data for pool creation");
      return;
    }

    if (!amount0 || Number.parseFloat(amount0) <= 0) {
      setTxError("Please enter a valid amount for first token");
      return;
    }

    if (!amount1 || Number.parseFloat(amount1) <= 0) {
      setTxError("Please enter a valid amount for second token");
      return;
    }

    if (chainId !== mainnet.id) {
      setTxError("Please connect to Ethereum mainnet to create pools");
      return;
    }

    setTxError(null);

    try {
      // Create pool key for Cookbook
      const poolKey = createCookbookPoolKey(token0, token1, feeBps);

      // Determine amounts based on pool key ordering / token decimals
      const amount0Desired =
        token0.id === null
          ? parseEther(amount0)
          : parseUnits(amount0, token0.decimals || 18);

      const amount1Desired = parseUnits(amount1, token1.decimals || 18);

      // ---------- NEW: Generic ERC-20 allowance checks (for both sides) ----------
      const ensureAllowance = async (
        token: TokenMeta,
        desired: bigint,
        allowance: bigint | undefined,
        approveMax: () => Promise<`0x${string}` | false>,
        refetch: () => Promise<any>,
        label: string,
      ) => {
        if (!isErc20(token)) return; // Not a standard ERC-20 -> skip (ETH or ZAMM/COOKBOOK internal)
        // If hook wasn’t initialized due to missing address, skip (defensive)
        const hasHook =
          typeof allowance !== "undefined" && typeof approveMax === "function";
        if (!hasHook) return;

        if (allowance === undefined || desired > allowance) {
          setTxError(
            `Waiting for ${token.symbol ?? label} approval. Please confirm the transaction...`,
          );
          const tx = await approveMax();
          if (!tx) return; // user rejected or hook returned false
          const rcpt = await publicClient.waitForTransactionReceipt({
            hash: tx,
          });
          if (rcpt.status === "success") {
            await refetch();
            setTxError(null);
          } else {
            setTxError(
              `${token.symbol ?? label} approval failed. Please try again.`,
            );
            return;
          }
        }
      };

      // Run allowance checks sequentially to keep UX/status messaging simple
      await ensureAllowance(
        token0,
        amount0Desired,
        allowance0,
        approve0,
        refetch0,
        "FIRST",
      );
      await ensureAllowance(
        token1,
        amount1Desired,
        allowance1,
        approve1,
        refetch1,
        "SECOND",
      );

      // ---------- Existing ZAMM operator approval ----------
      // If either side is a ZAMM coin and user hasn't set operator -> set it.
      const needsToken0Operator =
        token0.id !== null && needsOperatorApproval(token0);
      const needsToken1Operator = needsOperatorApproval(token1);

      if (
        (needsToken0Operator || needsToken1Operator) &&
        isOperator === false
      ) {
        setTxError(
          "Waiting for operator approval. Please confirm the transaction...",
        );

        const approvalHash = await writeContractAsync({
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "setOperator",
          args: [CookbookAddress, true],
        });

        setTxError("Operator approval submitted. Waiting for confirmation...");
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: approvalHash,
        });

        if (receipt.status === "success") {
          await refetchOperator();
          setTxError(null);
        } else {
          setTxError("Operator approval failed. Please try again.");
          return;
        }
      }

      // ---------- Create the pool by calling addLiquidity ----------
      const deadline = nowSec() + 1200n; // 20 minutes

      const hash = await writeContractAsync({
        address: CookbookAddress,
        abi: CookbookAbi,
        functionName: "addLiquidity",
        args: [
          poolKey,
          amount0Desired,
          amount1Desired,
          0n, // amount0Min - no slippage protection for pool creation
          0n, // amount1Min - no slippage protection for pool creation
          address,
          deadline,
        ],
        value: poolKey.id0 === 0n ? amount0Desired : 0n, // Send ETH if token0 is ETH
      });

      setTxHash(hash);
    } catch (err) {
      const errorMsg = handleWalletError(err);
      if (errorMsg) {
        console.error("Pool creation error:", err);

        if (err instanceof Error) {
          if (err.message.includes("insufficient funds")) {
            setTxError("Insufficient funds for this transaction");
          } else if (err.message.includes("PoolAlreadyExists")) {
            setTxError("Pool already exists for this token pair and fee tier");
          } else {
            setTxError("Transaction failed. Please try again.");
          }
        } else {
          setTxError("Unknown error during pool creation");
        }
      }
    }
  };

  const handleToken0Select = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setAmount0("");
      setAmount1("");
      setToken0(token);
    },
    [txError],
  );

  const handleToken1Select = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setAmount0("");
      setAmount1("");
      setToken1(token);
    },
    [txError],
  );

  return (
    <div className="relative flex flex-col">
      {/* First token panel */}
      <SwapPanel
        title="First Token"
        selectedToken={token0}
        tokens={memoizedTokens}
        onSelect={handleToken0Select}
        isEthBalanceFetching={isEthBalanceFetching}
        amount={amount0}
        onAmountChange={setAmount0}
        showMaxButton={!!(token0.balance !== undefined && token0.balance > 0n)}
        onMax={() => {
          if (token0.id === null) {
            const ethAmount = ((token0.balance as bigint) * 99n) / 100n;
            setAmount0(formatEther(ethAmount));
          } else {
            const decimals = token0.decimals || 18;
            setAmount0(formatUnits(token0.balance as bigint, decimals));
          }
        }}
        className="rounded-t-2xl pb-4"
      />

      {/* Second token panel */}
      {token1 && (
        <SwapPanel
          title="Second Token"
          selectedToken={token1}
          tokens={memoizedTokens}
          onSelect={handleToken1Select}
          isEthBalanceFetching={isEthBalanceFetching}
          amount={amount1}
          onAmountChange={setAmount1}
          showMaxButton={
            !!(token1.balance !== undefined && token1.balance > 0n)
          }
          onMax={() => {
            if (token1.id === null) {
              const ethAmount = ((token1.balance as bigint) * 99n) / 100n;
              setAmount1(formatEther(ethAmount));
            } else {
              const decimals = token1.decimals || 18;
              setAmount1(formatUnits(token1.balance as bigint, decimals));
            }
          }}
          className="mt-2 rounded-b-2xl pt-3 shadow-[0_0_15px_rgba(0,204,255,0.07)]"
        />
      )}

      <NetworkError message="create pools" />

      {/* Fee tier settings */}
      <FeeSettings feeBps={feeBps} setFeeBps={setFeeBps} />

      <div className="text-xs bg-muted/50 border border-primary/30 rounded p-2 mt-2 text-muted-foreground dark:text-gray-300">
        <p className="font-medium mb-1">Creating a new pool will:</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Initialize a new trading pair with your chosen fee tier</li>
          <li>Provide initial liquidity and receive LP tokens</li>
          <li>Enable trading for other users on this pair</li>
          <li>You'll earn fees from all future trades</li>
        </ul>
      </div>

      <button
        onClick={executeCreatePool}
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
            Creating Pool...
          </span>
        ) : (
          "CREATE POOL"
        )}
      </button>

      {/* Status and error messages */}
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
