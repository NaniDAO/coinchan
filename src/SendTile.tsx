import { useState, useEffect, useCallback, useMemo, memo } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  usePublicClient,
  useSendTransaction,
} from "wagmi";
import { mainnet } from "viem/chains";
import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import {
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  Address,
} from "viem";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { ETH_TOKEN, TokenMeta, USDT_ADDRESS } from "./lib/coins";
import { TokenSelector } from "./components/TokenSelector";

// Helper function to format token balance with appropriate precision
export const formatTokenBalance = (token: TokenMeta): string => {
  if (token.balance === undefined) {
    // For ETH specifically, always show 0 rather than blank
    return token.id === null ? "0" : "";
  }

  if (token.balance === 0n) return "0";

  try {
    // Special case for ETH
    if (token.id === null) {
      // Convert ETH balance to string first for precise formatting
      const ethBalanceStr = formatEther(token.balance);
      const ethValue = Number(ethBalanceStr);

      if (ethValue === 0) return "0"; // If somehow zero after conversion

      // Display ETH with appropriate precision based on size
      if (ethValue >= 1000) {
        return `${Math.floor(ethValue).toLocaleString()}`;
      } else if (ethValue >= 1) {
        return ethValue.toFixed(4); // Show 4 decimals for values ≥ 1
      } else if (ethValue >= 0.001) {
        return ethValue.toFixed(6); // Show 6 decimals for medium values
      } else if (ethValue >= 0.0000001) {
        // For very small values, use 8 decimals (typical for ETH)
        return ethValue.toFixed(8);
      } else {
        // For extremely small values, use readable scientific notation
        return ethValue.toExponential(4);
      }
    }

    // For regular tokens
    // Use correct decimals for the token (default to 18)
    const decimals = token.decimals || 18;
    const tokenValue = Number(formatUnits(token.balance, decimals));

    if (tokenValue >= 1000) {
      return `${Math.floor(tokenValue).toLocaleString()}`;
    } else if (tokenValue >= 1) {
      return tokenValue.toFixed(3); // 3 decimals for ≥ 1
    } else if (tokenValue >= 0.001) {
      return tokenValue.toFixed(4); // 4 decimals for smaller values
    } else if (tokenValue >= 0.0001) {
      return tokenValue.toFixed(6); // 6 decimals for tiny values
    } else if (tokenValue > 0) {
      return tokenValue.toExponential(2); // Scientific notation for extremely small
    }

    return "0";
  } catch (error) {
    // Error formatting balance
    return token.id === null ? "0" : ""; // Always return 0 for ETH on error
  }
};

// Safe string helper function
const safeStr = (val: any): string => {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "bigint") return String(val);
  return "";
};

// Main SendTile component - Memoized for better performance
const SendTileComponent = () => {
  const {
    tokens,
    error: loadError,
    isEthBalanceFetching,
    refetchEthBalance,
  } = useAllCoins();
  const [selectedToken, setSelectedToken] = useState<TokenMeta>(ETH_TOKEN);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [parsedAmount, setParsedAmount] = useState<bigint>(0n);
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Update selected token when tokens load, with improved error handling
  useEffect(() => {
    if (tokens.length > 0) {
      // Find ETH token in the loaded tokens
      const ethToken = tokens.find((token) => token.id === null);
      if (ethToken) {
        setSelectedToken(ethToken);
        console.log(
          "Selected ETH token with balance:",
          ethToken.balance?.toString() || "0",
        );
      }

      // Log all available tokens for debugging
      console.log(
        "Available tokens:",
        tokens.map((t) => ({
          symbol: t.symbol,
          id: t.id?.toString() || "ETH",
          balance: t.balance?.toString() || "0",
        })),
      );
    }
  }, [tokens]);

  // Handle token selection
  const handleTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear any errors when changing tokens
      if (txError) setTxError(null);
      // Reset input values
      setAmount("");
      // Set the new token
      setSelectedToken(token);
    },
    [txError],
  );

  // Handle amount input change
  const handleAmountChange = (value: string) => {
    // Accept only numbers, one decimal point, and no more than 18 decimal places
    if (value === "" || /^(?:\d+(?:\.\d{0,18})?|\.\d{0,18})$/.test(value)) {
      setAmount(value);

      try {
        // Parse the amount based on token type
        if (selectedToken.id === null) {
          // ETH: 18 decimals
          setParsedAmount(value ? parseEther(value) : 0n);
        } else if (
          selectedToken.isCustomPool &&
          selectedToken.symbol === "USDT"
        ) {
          // USDT: 6 decimals
          setParsedAmount(value ? parseUnits(value, 6) : 0n);
        } else {
          // Regular ERC6909 tokens: 18 decimals
          setParsedAmount(value ? parseEther(value) : 0n);
        }
      } catch (error) {
        console.error("Error parsing amount:", error);
        setParsedAmount(0n);
      }
    }
  };

  // Max button handler
  const handleMaxClick = () => {
    if (!selectedToken.balance || selectedToken.balance === 0n) {
      console.log("MAX clicked but token has no balance");
      return;
    }

    console.log(
      `MAX clicked for ${selectedToken.symbol} with balance ${selectedToken.balance.toString()}`,
    );

    let maxValue: string;
    let maxParsedAmount: bigint;

    if (selectedToken.id === null) {
      // For ETH, use a percentage-based approach (like in SwapTile) to leave gas
      // Use 99% of balance to ensure there's always enough for gas
      const ethAmount = (selectedToken.balance * 99n) / 100n;

      // Format to a reasonable number of decimal places
      const formattedValue = formatEther(ethAmount);
      // Parse to number and format to avoid excessive decimals
      const parsedValue = parseFloat(formattedValue).toFixed(6);
      // Remove trailing zeros for cleaner display
      maxValue = parsedValue.replace(/\.?0+$/, "");
      maxParsedAmount = ethAmount;

      console.log(`ETH MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    } else if (selectedToken.isCustomPool && selectedToken.symbol === "USDT") {
      // USDT: 6 decimals
      const formattedValue = formatUnits(selectedToken.balance, 6);
      const parsedValue = parseFloat(formattedValue).toFixed(2);
      maxValue = parsedValue.replace(/\.?0+$/, ""); // Remove trailing zeros
      maxParsedAmount = selectedToken.balance;

      console.log(`USDT MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    } else {
      // Regular ERC6909 tokens: 18 decimals
      const formattedValue = formatEther(selectedToken.balance);
      const parsedValue = parseFloat(formattedValue).toFixed(4);
      maxValue = parsedValue.replace(/\.?0+$/, ""); // Remove trailing zeros
      maxParsedAmount = selectedToken.balance;

      console.log(`Token MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    }

    // Set UI values and update the parsed amount
    setAmount(maxValue);
    setParsedAmount(maxParsedAmount);
  };

  // Check if send is allowed
  const canSend = useMemo(() => {
    // Must have a valid recipient address
    if (
      !recipientAddress ||
      !recipientAddress.startsWith("0x") ||
      recipientAddress.length !== 42
    ) {
      return false;
    }

    // Amount must be greater than 0 and not exceed balance
    if (
      !parsedAmount ||
      parsedAmount <= 0n ||
      !selectedToken.balance ||
      parsedAmount > selectedToken.balance
    ) {
      return false;
    }

    return true;
  }, [recipientAddress, parsedAmount, selectedToken.balance]);

  // Send transaction handler
  const handleSend = async () => {
    if (!address || !isConnected || !publicClient || !canSend) return;

    // Clear previous tx state
    setTxHash(undefined);
    setTxError(null);

    try {
      // Different logic based on token type
      if (selectedToken.id === null) {
        // Send ETH directly
        console.log(
          "Sending ETH:",
          formatEther(parsedAmount),
          "to",
          recipientAddress,
        );

        // For ETH transfers, use the correct sendTransaction approach
        const hash = await sendTransactionAsync({
          to: recipientAddress as Address,
          value: parsedAmount, // Amount to send
        });

        setTxHash(hash);
      } else if (
        selectedToken.isCustomPool &&
        selectedToken.symbol === "USDT"
      ) {
        // Send USDT (ERC20) - simplified approach
        console.log(
          "Sending USDT:",
          formatUnits(parsedAmount, 6),
          "to",
          recipientAddress,
        );

        // Define USDT standard ERC20 transfer ABI
        const erc20Abi = [
          {
            inputs: [
              { internalType: "address", name: "to", type: "address" },
              { internalType: "uint256", name: "value", type: "uint256" },
            ],
            name: "transfer",
            outputs: [{ internalType: "bool", name: "", type: "bool" }],
            stateMutability: "nonpayable",
            type: "function",
          },
        ];

        // ERC20 transfer with detailed logging
        console.log("USDT contract address:", USDT_ADDRESS);
        console.log("USDT amount in raw units:", parsedAmount.toString());

        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id, // Explicitly set chainId
          address: USDT_ADDRESS,
          abi: erc20Abi, // Use the variable to avoid inline definition
          functionName: "transfer",
          args: [recipientAddress as `0x${string}`, parsedAmount],
        });

        setTxHash(hash);
      } else {
        // Send ERC6909 token (Coin)
        console.log(
          `Sending ${selectedToken.symbol} (ID: ${selectedToken.id}):`,
          formatEther(parsedAmount),
          "to",
          recipientAddress,
        );

        // ERC6909 transfer with detailed logging
        console.log("Coins contract address:", CoinsAddress);
        console.log("Token ID:", selectedToken.id?.toString());
        console.log("Amount in raw units:", parsedAmount.toString());

        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id, // Explicitly set chainId
          address: CoinsAddress,
          abi: CoinsAbi,
          functionName: "transfer",
          args: [
            recipientAddress as `0x${string}`,
            selectedToken.id!,
            parsedAmount,
          ],
        });

        setTxHash(hash);
      }
    } catch (error) {
      console.error("Send transaction error:", error);

      // Handle user rejection gracefully
      if (isUserRejectionError(error)) {
        setTxError("Transaction rejected by user");
      } else {
        // Handle contract errors
        const errorMsg = handleWalletError(error) || "Transaction failed";
        setTxError(errorMsg);
      }
    }
  };

  // Success handling - refresh balances
  useEffect(() => {
    if (isSuccess && txHash) {
      // Reset UI state
      setAmount("");
      setParsedAmount(0n);

      // Display success message
      console.log("Transaction successful: " + txHash);

      // Refresh ETH balance
      refetchEthBalance();

      // Refresh token balances after a slight delay
      setTimeout(() => {
        refetchEthBalance();
      }, 1500); // Extra refresh after 1.5s to ensure balances are updated
    }
  }, [isSuccess, txHash, refetchEthBalance]);

  // Calculate percent of balance
  const percentOfBalance = useMemo((): number => {
    if (!selectedToken.balance || selectedToken.balance === 0n || !parsedAmount)
      return 0;

    // Convert to number explicitly
    const percent = Number((parsedAmount * 100n) / selectedToken.balance);
    return Number.isFinite(percent) ? percent : 0;
  }, [selectedToken.balance, parsedAmount]);

  return (
    <Card className="border-border shadow-md mb-4">
      <CardHeader>
        <CardTitle>Send Coins</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Recipient address input */}
        <div className="grid grid-cols-5 gap-4 w-full mb-4">
          <div className="col-span-3">
            <label className="block text-sm font-medium text-foreground mb-1">
              Recipient Address
            </label>
            <div className="h-12">
              {" "}
              {/* Set fixed height to match TokenSelector */}
              <input
                type="text"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                placeholder="0x..."
                className="w-full p-2 border-2 border-primary rounded focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary focus-within:outline-none h-full"
              />
            </div>
            {recipientAddress &&
              (!recipientAddress.startsWith("0x") ||
                recipientAddress.length !== 42) && (
                <p className="mt-1 text-sm text-destructive">
                  Please enter a valid Ethereum address
                </p>
              )}
          </div>
          {/* Token selector */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Asset to Send
            </label>
            <TokenSelector
              selectedToken={selectedToken}
              tokens={tokens.length > 0 ? tokens : [ETH_TOKEN]} // Ensure we always have at least ETH
              onSelect={handleTokenSelect}
              isEthBalanceFetching={isEthBalanceFetching}
              className="h-12"
            />
          </div>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <label className="block text-sm font-medium text-foreground">
              Amount
            </label>
            <button
              onClick={handleMaxClick}
              className="text-xs text-primary hover:text-primary/80"
              disabled={!selectedToken.balance || selectedToken.balance === 0n}
            >
              MAX
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.0"
              className={`w-full h-12 p-2 border-2 border-primary/40 rounded focus-within:ring-2 hover:bg-secondary-foreground focus-within:ring-primary focus-within:outline-none ${
                selectedToken.isFetching ? "token-loading" : ""
              }`}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 font-medium text-sm text-muted-foreground">
              {safeStr(selectedToken.symbol)}
              {/* Show loading indicator if token is being fetched */}
              {selectedToken.isFetching && (
                <span
                  className="text-xs text-primary ml-1 inline-block"
                  style={{ animation: "pulse 1.5s infinite" }}
                >
                  ⟳
                </span>
              )}
            </div>
          </div>

          {amount && typeof selectedToken.balance === "bigint" && (
            <div className="mt-1 text-xs text-muted-foreground flex justify-between">
              <span>
                {percentOfBalance > 100 ? (
                  <span className="text-destructive">Insufficient balance</span>
                ) : (
                  `${percentOfBalance.toFixed(0)}% of balance`
                )}
              </span>
              <span>
                Balance: {formatTokenBalance(selectedToken)}{" "}
                {selectedToken.symbol !== undefined
                  ? safeStr(selectedToken.symbol)
                  : ""}
              </span>
            </div>
          )}
        </div>

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={!canSend || isPending}
          className="w-full bg-primary hover:bg-primary/80 text-background font-bold py-2 px-4 rounded"
        >
          {isPending ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              <span>Sending...</span>
            </div>
          ) : (
            "Send 🪁"
          )}
        </Button>

        {/* Transaction status */}
        {txHash && (
          <div className="mt-4 p-3 bg-chart-2/10 border border-chart-2/20 rounded">
            <p className="text-sm text-chart-2">
              {isSuccess ? "Transaction successful!" : "Transaction submitted!"}{" "}
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View on Etherscan
              </a>
              {/* Show animation while waiting for transaction */}
              {!isSuccess && (
                <span
                  className="inline-block ml-2 text-primary"
                  style={{ animation: "pulse 1.5s infinite" }}
                >
                  (waiting for confirmation...)
                </span>
              )}
            </p>
          </div>
        )}

        {/* Error message */}
        {txError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive">{txError}</p>
          </div>
        )}

        {/* Loading error */}
        {loadError && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Export memoized version of the component for better performance
export const SendTile = memo(SendTileComponent);
