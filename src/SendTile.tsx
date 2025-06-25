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
  erc20Abi,
} from "viem";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { LoadingLogo } from "./components/ui/loading-logo";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { ETH_TOKEN, TokenMeta, USDT_ADDRESS } from "./lib/coins";
import { TokenSelector } from "./components/TokenSelector";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { useTranslation } from "react-i18next";

// Helper function to format token balance with appropriate precision
export const formatTokenBalance = (token: TokenMeta): string => {
  if (token.balance === undefined) {
    return token.id === null ? "0" : "";
  }

  if (token.balance === 0n) return "0";

  try {
    if (token.id === null) {
      const ethBalanceStr = formatEther(token.balance);
      const ethValue = Number(ethBalanceStr);

      if (ethValue === 0) return "0";

      if (ethValue >= 1000) {
        return `${Math.floor(ethValue).toLocaleString()}`;
      } else if (ethValue >= 1) {
        return ethValue.toFixed(4);
      } else if (ethValue >= 0.001) {
        return ethValue.toFixed(6);
      } else if (ethValue >= 0.0000001) {
        return ethValue.toFixed(8);
      } else {
        return ethValue.toExponential(4);
      }
    }

    const decimals = token.decimals || 18;
    const tokenValue = Number(formatUnits(token.balance, decimals));

    if (tokenValue >= 1000) {
      return `${Math.floor(tokenValue).toLocaleString()}`;
    } else if (tokenValue >= 1) {
      return tokenValue.toFixed(3);
    } else if (tokenValue >= 0.001) {
      return tokenValue.toFixed(4);
    } else if (tokenValue >= 0.0001) {
      return tokenValue.toFixed(6);
    } else if (tokenValue > 0) {
      return tokenValue.toExponential(2);
    }

    return "0";
  } catch (error) {
    return token.id === null ? "0" : "";
  }
};

const safeStr = (val: any): string => {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "bigint") return String(val);
  return "";
};

const SendTileComponent = () => {
  const { t } = useTranslation();
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
  const [isLockupMode, setIsLockupMode] = useState(false);
  const [unlockTime, setUnlockTime] = useState("");

  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const handleTokenSelect = useCallback(
    (token: TokenMeta) => {
      if (txError) setTxError(null);
      setAmount("");
      setSelectedToken(token);
    },
    [txError],
  );

  const handleAmountChange = (value: string) => {
    if (value === "" || /^(?:\d+(?:\.\d{0,18})?|\.\d{0,18})$/.test(value)) {
      setAmount(value);

      try {
        if (selectedToken.id === null) {
          setParsedAmount(value ? parseEther(value) : 0n);
        } else if (
          selectedToken.isCustomPool &&
          selectedToken.symbol === "USDT"
        ) {
          setParsedAmount(value ? parseUnits(value, 6) : 0n);
        } else {
          setParsedAmount(value ? parseEther(value) : 0n);
        }
      } catch (error) {
        console.error("Error parsing amount:", error);
        setParsedAmount(0n);
      }
    }
  };

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
      const ethAmount = (selectedToken.balance * 99n) / 100n;
      const formattedValue = formatEther(ethAmount);
      const parsedValue = parseFloat(formattedValue).toFixed(6);
      maxValue = parsedValue.replace(/\.?0+$/, "");
      maxParsedAmount = ethAmount;

      console.log(`ETH MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    } else if (selectedToken.isCustomPool && selectedToken.symbol === "USDT") {
      const formattedValue = formatUnits(selectedToken.balance, 6);
      const parsedValue = parseFloat(formattedValue).toFixed(2);
      maxValue = parsedValue.replace(/\.?0+$/, "");
      maxParsedAmount = selectedToken.balance;

      console.log(`USDT MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    } else {
      const formattedValue = formatEther(selectedToken.balance);
      const parsedValue = parseFloat(formattedValue).toFixed(4);
      maxValue = parsedValue.replace(/\.?0+$/, "");
      maxParsedAmount = selectedToken.balance;

      console.log(`Token MAX: ${maxValue} (${maxParsedAmount.toString()})`);
    }

    setAmount(maxValue);
    setParsedAmount(maxParsedAmount);
  };

  const canSend = useMemo(() => {
    if (
      !recipientAddress ||
      !recipientAddress.startsWith("0x") ||
      recipientAddress.length !== 42
    ) {
      return false;
    }

    if (
      !parsedAmount ||
      parsedAmount <= 0n ||
      !selectedToken.balance ||
      parsedAmount > selectedToken.balance
    ) {
      return false;
    }

    // For lockup mode, validate unlock time
    if (isLockupMode) {
      if (!unlockTime) return false;
      const unlockTimestamp = new Date(unlockTime).getTime();
      if (unlockTimestamp <= Date.now()) return false;
    }

    return true;
  }, [recipientAddress, parsedAmount, selectedToken.balance, isLockupMode, unlockTime]);

  const handleSend = async () => {
    if (!address || !isConnected || !publicClient || !canSend) return;

    setTxHash(undefined);
    setTxError(null);

    try {
      // Handle lockup mode
      if (isLockupMode) {
        const unlockTimestamp = Math.floor(new Date(unlockTime).getTime() / 1000);
        
        if (selectedToken.id === null) {
          // ETH lockup: use address(0) as token, id as 0, and send ETH as msg.value
          console.log(
            `Locking up ETH:`,
            formatEther(parsedAmount),
            "to",
            recipientAddress,
            "until",
            new Date(unlockTimestamp * 1000).toLocaleString()
          );

          const hash = await writeContractAsync({
            account: address,
            chainId: mainnet.id,
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "lockup",
            args: [
              "0x0000000000000000000000000000000000000000" as `0x${string}`, // address(0) for ETH
              recipientAddress as `0x${string}`,
              0n, // id = 0 for ETH
              parsedAmount,
              BigInt(unlockTimestamp),
            ],
            value: parsedAmount, // Send ETH as msg.value
          });

          setTxHash(hash);
        } else {
          // Token lockup: use token address, specific id, no msg.value
          let tokenAddress: `0x${string}`;
          let displayAmount: string;

          if (selectedToken.isCustomPool && selectedToken.symbol === "USDT") {
            // USDT special handling
            tokenAddress = USDT_ADDRESS;
            displayAmount = formatUnits(parsedAmount, 6);
          } else if (selectedToken?.source === "COOKBOOK") {
            tokenAddress = CookbookAddress;
            displayAmount = formatEther(parsedAmount);
          } else {
            tokenAddress = CoinsAddress;
            displayAmount = formatEther(parsedAmount);
          }

          console.log(
            `Locking up ${selectedToken.symbol} (ID: ${selectedToken.id}):`,
            displayAmount,
            "to",
            recipientAddress,
            "until",
            new Date(unlockTimestamp * 1000).toLocaleString()
          );

          const hash = await writeContractAsync({
            account: address,
            chainId: mainnet.id,
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "lockup",
            args: [
              tokenAddress,
              recipientAddress as `0x${string}`,
              selectedToken.id!,
              parsedAmount,
              BigInt(unlockTimestamp),
            ],
          });

          setTxHash(hash);
        }
        return;
      }

      // Regular send logic
      if (selectedToken.id === null) {
        console.log(
          "Sending ETH:",
          formatEther(parsedAmount),
          "to",
          recipientAddress,
        );

        const hash = await sendTransactionAsync({
          to: recipientAddress as Address,
          value: parsedAmount,
        });

        setTxHash(hash);
      } else if (
        selectedToken.isCustomPool &&
        selectedToken.symbol === "USDT"
      ) {
        console.log(
          "Sending USDT:",
          formatUnits(parsedAmount, 6),
          "to",
          recipientAddress,
        );
        console.log("USDT contract address:", USDT_ADDRESS);
        console.log("USDT amount in raw units:", parsedAmount.toString());

        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id,
          address: USDT_ADDRESS,
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipientAddress as `0x${string}`, parsedAmount],
        });

        setTxHash(hash);
      } else {
        console.log(
          `Sending ${selectedToken.symbol} (ID: ${selectedToken.id}):`,
          formatEther(parsedAmount),
          "to",
          recipientAddress,
        );

        console.log("Coins contract address:", CoinsAddress);
        console.log("Token ID:", selectedToken.id?.toString());
        console.log("Amount in raw units:", parsedAmount.toString());
        console.log("Token Source:", selectedToken?.source);

        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id,
          address:
            selectedToken?.source === "COOKBOOK"
              ? CookbookAddress
              : CoinsAddress,
          abi: selectedToken?.source === "COOKBOOK" ? CookbookAbi : CoinsAbi,
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

      if (isUserRejectionError(error)) {
        setTxError(t("create.transaction_rejected"));
      } else {
        const errorMsg =
          handleWalletError(error) || t("create.transaction_failed");
        setTxError(errorMsg);
      }
    }
  };

  useEffect(() => {
    if (isSuccess && txHash) {
      setAmount("");
      setParsedAmount(0n);
      setUnlockTime("");
      setIsLockupMode(false);

      console.log("Transaction successful: " + txHash);

      refetchEthBalance();

      setTimeout(() => {
        refetchEthBalance();
      }, 1500);
    }
  }, [isSuccess, txHash, refetchEthBalance]);

  const percentOfBalance = useMemo((): number => {
    if (!selectedToken.balance || selectedToken.balance === 0n || !parsedAmount)
      return 0;

    const percent = Number((parsedAmount * 100n) / selectedToken.balance);
    return Number.isFinite(percent) ? percent : 0;
  }, [selectedToken.balance, parsedAmount]);

  return (
    <div className="p-6 bg-background text-foreground ">
      <div className="max-w-lg border-2 border-border  p-2 outline outline-offset-2 outline-border mx-auto">
        <div className="mb-5">
          <label className="block text-sm font-bold mb-2 font-body">
            {t("create.recipient_address").toUpperCase()}:
          </label>
          <input
            type="text"
            value={recipientAddress}
            onChange={(e) => setRecipientAddress(e.target.value)}
            placeholder="0x..."
            className="w-full px-3 py-2 bg-input border border-border rounded focus:outline-none focus:border-accent"
          />
          {recipientAddress &&
            (!recipientAddress.startsWith("0x") ||
              recipientAddress.length !== 42) && (
              <p className="mt-2 text-sm text-destructive font-bold">
                ⚠ {t("create.invalid_address_warning")}
              </p>
            )}
        </div>

        <div className="mb-5">
          <label className="block text-sm font-bold mb-2 font-body">
            {t("create.asset_to_send").toUpperCase()}:
          </label>
          <TokenSelector
            selectedToken={selectedToken}
            tokens={tokens.length > 0 ? tokens : [ETH_TOKEN]}
            onSelect={handleTokenSelect}
            isEthBalanceFetching={isEthBalanceFetching}
            className="w-full"
          />
        </div>

        <div className="mb-5">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isLockupMode}
                onChange={(e) => setIsLockupMode(e.target.checked)}
                className="w-4 h-4 rounded border-border focus:ring-accent"
              />
              <span className="text-sm font-bold font-body">
                LOCKUP MODE
              </span>
            </label>
          </div>
          {isLockupMode && (
            <div className="mt-3">
              <label className="block text-sm font-bold mb-2 font-body">
                UNLOCK TIME:
              </label>
              <input
                type="datetime-local"
                value={unlockTime}
                onChange={(e) => setUnlockTime(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full px-3 py-2 bg-input border border-border rounded focus:outline-none focus:border-accent"
              />
              {unlockTime && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Tokens will be locked until {new Date(unlockTime).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold font-body">
              {t("create.amount").toUpperCase()}:
            </label>
            <button
              onClick={handleMaxClick}
              className="px-2 py-1 text-xs uppercase bg-secondary hover:bg-secondary/80 rounded disabled:opacity-50"
              disabled={!selectedToken.balance || selectedToken.balance === 0n}
            >
              {t("create.max").toUpperCase()}
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.0"
              className={`w-full px-3 py-2 pr-20 bg-input border border-border rounded focus:outline-none focus:border-accent ${
                selectedToken.isFetching ? "animate-pulse" : ""
              }`}
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 font-bold text-sm font-body">
              {safeStr(selectedToken.symbol)}
              {selectedToken.isFetching && (
                <span className="text-xs ml-1 inline-block text-accent animate-spin">
                  ⟳
                </span>
              )}
            </div>
          </div>

          {amount && typeof selectedToken.balance === "bigint" && (
            <div className="mt-2 text-xs font-bold font-body flex justify-between">
              <span>
                {percentOfBalance > 100 ? (
                  <span className="text-destructive">
                    ⚠ {t("create.insufficient_balance").toUpperCase()}
                  </span>
                ) : (
                  `${percentOfBalance.toFixed(0)}${t("create.percent_of_balance")}`
                )}
              </span>
              <span>
                {t("create.balance").toUpperCase()}:{" "}
                {formatTokenBalance(selectedToken)}{" "}
                {selectedToken.symbol !== undefined
                  ? safeStr(selectedToken.symbol)
                  : ""}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!canSend || isPending}
          className="w-full py-4 text-base font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted rounded flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <LoadingLogo size="sm" />
              <span>{isLockupMode ? "LOCKING UP" : t("create.sending").toUpperCase()}</span>
            </>
          ) : (
            <>
              <span>{isLockupMode ? "LOCKUP" : t("create.send").toUpperCase()}</span>
              <span className="text-primary-foreground/80">{isLockupMode ? "🔒" : "🪁"}</span>
            </>
          )}
        </button>

        {txHash && (
          <div className="mt-4 p-3 border-2 border-accent bg-card font-body">
            <p className="text-sm font-bold">
              <span className="text-accent">
                {isSuccess
                  ? `✓ ${isLockupMode ? "LOCKUP SUCCESSFUL" : t("create.transaction_successful").toUpperCase()}`
                  : `⏳ ${isLockupMode ? "LOCKUP SUBMITTED" : t("create.transaction_submitted").toUpperCase()}`}
              </span>{" "}
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded ml-2 no-underline"
              >
                {t("create.view_on_etherscan").toUpperCase()}
              </a>
              {!isSuccess && (
                <span className="inline-block ml-2 text-accent font-bold animate-pulse">
                  {t("create.waiting_for_confirmation").toUpperCase()}
                </span>
              )}
            </p>
          </div>
        )}

        {txError && (
          <div className="mt-4 p-3 border-2 border-destructive bg-card font-body">
            <p className="text-sm font-bold text-destructive">
              ⚠ {t("create.error").toUpperCase()}: {txError.toUpperCase()}
            </p>
          </div>
        )}

        {loadError && (
          <div className="mt-4 p-3 border-2 border-destructive bg-card font-body">
            <p className="text-sm font-bold text-destructive">
              ⚠ {t("create.loading_error").toUpperCase()}:{" "}
              {loadError.toUpperCase()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const SendTile = memo(SendTileComponent);
