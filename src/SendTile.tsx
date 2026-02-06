import { handleWalletError, isUserRejectionError } from "@/lib/errors";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { useAccount, usePublicClient, useSendTransaction, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { TokenSelector } from "./components/TokenSelector";
import { LoadingLogo } from "./components/ui/loading-logo";
import { CoinsAbi, CoinsAddress } from "./constants/Coins";
import { CookbookAbi, CookbookAddress } from "./constants/Cookbook";
import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { useENSResolution } from "./hooks/use-ens-resolution";
import { ETH_TOKEN, type TokenMeta } from "./lib/coins";

// Helper to determine if a token is an ERC20 (not ETH, not ERC6909)
const isERC20Token = (token: TokenMeta): boolean => {
  // ETH is not ERC20
  if (token.id === null) return false;
  // Explicit ERC20 source
  if (token.source === "ERC20") return true;
  // Custom pool tokens with token1 address are ERC20s
  if (token.isCustomPool && token.token1) return true;
  return false;
};

// Get the contract address for an ERC20 token
const getERC20Address = (token: TokenMeta): `0x${string}` | null => {
  if (token.source === "ERC20" && token.token1) return token.token1;
  if (token.isCustomPool && token.token1) return token.token1;
  return null;
};

// Get decimals for a token (default to 18)
const getTokenDecimals = (token: TokenMeta): number => {
  return token.decimals ?? 18;
};

// Helper function to format token balance with appropriate precision
export const formatTokenBalance = (token: TokenMeta): string => {
  if (token.balance === undefined) {
    return token.id === null ? "0" : "";
  }

  if (token.balance === 0n) return "0";

  try {
    const decimals = getTokenDecimals(token);
    const tokenValue = Number(formatUnits(token.balance, decimals));

    if (tokenValue === 0) return "0";

    // Adjust display precision based on token decimals
    if (tokenValue >= 1000) {
      return `${Math.floor(tokenValue).toLocaleString()}`;
    }
    if (tokenValue >= 1) {
      return tokenValue.toFixed(decimals <= 6 ? 2 : 4);
    }
    if (tokenValue >= 0.001) {
      return tokenValue.toFixed(decimals <= 6 ? 4 : 6);
    }
    if (tokenValue >= 0.0000001) {
      return tokenValue.toFixed(8);
    }
    if (tokenValue > 0) {
      return tokenValue.toExponential(2);
    }

    return "0";
  } catch {
    return token.id === null ? "0" : "";
  }
};

const safeStr = (val: string | number | bigint | undefined | null): string => {
  if (val === undefined || val === null) return "";
  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "bigint") return String(val);
  return "";
};

const SendTileComponent = () => {
  const { t } = useTranslation();
  const { tokens, error: loadError, isEthBalanceFetching, refetchEthBalance } = useAllCoins();
  const [selectedToken, setSelectedToken] = useState<TokenMeta>(ETH_TOKEN);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [parsedAmount, setParsedAmount] = useState<bigint>(0n);
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [txError, setTxError] = useState<string | null>(null);

  // ENS resolution for recipient
  const ensResolution = useENSResolution(recipientAddress);
  const [isLockupMode, setIsLockupMode] = useState(false);
  const [unlockTime, setUnlockTime] = useState("");

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient({ chainId: mainnet.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // Check if sending to own address (warning)
  const isSelfSend = useMemo(() => {
    if (!address || !ensResolution.address) return false;
    return ensResolution.address.toLowerCase() === address.toLowerCase();
  }, [address, ensResolution.address]);

  const handleTokenSelect = useCallback(
    (token: TokenMeta) => {
      // Clear transaction state when changing tokens
      if (txError) setTxError(null);
      if (txHash) setTxHash(undefined);
      setAmount("");
      setParsedAmount(0n);
      setSelectedToken(token);
    },
    [txError, txHash],
  );

  const handleAmountChange = (value: string) => {
    const decimals = getTokenDecimals(selectedToken);
    // Allow input up to the token's decimal places
    const decimalPattern = new RegExp(`^(?:\\d+(?:\\.\\d{0,${decimals}})?|\\.\\d{0,${decimals}})$`);

    if (value === "" || decimalPattern.test(value)) {
      setAmount(value);

      try {
        if (value) {
          setParsedAmount(parseUnits(value, decimals));
        } else {
          setParsedAmount(0n);
        }
      } catch (error) {
        console.error("Error parsing amount:", error);
        setParsedAmount(0n);
      }
    }
  };

  const handleMaxClick = () => {
    if (!selectedToken.balance || selectedToken.balance === 0n) {
      return;
    }

    const decimals = getTokenDecimals(selectedToken);
    let maxParsedAmount: bigint;

    // For ETH, reserve 1% for gas
    if (selectedToken.id === null) {
      maxParsedAmount = (selectedToken.balance * 99n) / 100n;
    } else {
      maxParsedAmount = selectedToken.balance;
    }

    // Format with appropriate precision based on decimals
    const formattedValue = formatUnits(maxParsedAmount, decimals);
    const displayPrecision = decimals <= 6 ? 2 : decimals <= 8 ? 4 : 6;
    const parsedValue = Number.parseFloat(formattedValue).toFixed(displayPrecision);
    const maxValue = parsedValue.replace(/\.?0+$/, "");

    setAmount(maxValue);
    setParsedAmount(maxParsedAmount);
  };

  const canSend = useMemo(() => {
    if (!recipientAddress || ensResolution.isLoading || ensResolution.error || !ensResolution.address) {
      return false;
    }

    if (!parsedAmount || parsedAmount <= 0n || !selectedToken.balance || parsedAmount > selectedToken.balance) {
      return false;
    }

    // For lockup mode, validate unlock time
    if (isLockupMode) {
      if (!unlockTime) return false;
      const unlockTimestamp = new Date(unlockTime).getTime();
      if (unlockTimestamp <= Date.now()) return false;
    }

    return true;
  }, [
    recipientAddress,
    ensResolution.isLoading,
    ensResolution.error,
    ensResolution.address,
    parsedAmount,
    selectedToken.balance,
    isLockupMode,
    unlockTime,
  ]);

  const handleSend = async () => {
    // Handle wallet not connected
    if (!isConnected) {
      openConnectModal?.();
      return;
    }

    if (!address || !publicClient || !canSend) return;

    setTxHash(undefined);
    setTxError(null);

    try {
      const erc20Address = getERC20Address(selectedToken);
      const isERC20 = isERC20Token(selectedToken);

      // Handle lockup mode
      if (isLockupMode) {
        const unlockTimestamp = Math.floor(new Date(unlockTime).getTime() / 1000);

        if (selectedToken.id === null) {
          // ETH lockup: use address(0) as token, id as 0, and send ETH as msg.value
          const hash = await writeContractAsync({
            account: address,
            chainId: mainnet.id,
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "lockup",
            args: [
              "0x0000000000000000000000000000000000000000" as `0x${string}`, // address(0) for ETH
              ensResolution.address!,
              0n, // id = 0 for ETH
              parsedAmount,
              BigInt(unlockTimestamp),
            ],
            value: parsedAmount, // Send ETH as msg.value
          });

          setTxHash(hash);
        } else if (isERC20 && erc20Address) {
          // ERC20 lockup: use the token's contract address
          const hash = await writeContractAsync({
            account: address,
            chainId: mainnet.id,
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "lockup",
            args: [erc20Address, ensResolution.address!, 0n, parsedAmount, BigInt(unlockTimestamp)],
          });

          setTxHash(hash);
        } else {
          // ERC6909 lockup: use token's source contract
          const tokenAddress = selectedToken?.source === "COOKBOOK" ? CookbookAddress : CoinsAddress;

          const hash = await writeContractAsync({
            account: address,
            chainId: mainnet.id,
            address: CookbookAddress,
            abi: CookbookAbi,
            functionName: "lockup",
            args: [tokenAddress, ensResolution.address!, selectedToken.id!, parsedAmount, BigInt(unlockTimestamp)],
          });

          setTxHash(hash);
        }
        return;
      }

      // Regular send logic
      if (selectedToken.id === null) {
        // Native ETH transfer
        const hash = await sendTransactionAsync({
          to: ensResolution.address!,
          value: parsedAmount,
        });

        setTxHash(hash);
      } else if (isERC20 && erc20Address) {
        // ERC20 transfer (USDT, CULT, ENS, WLFI, JPYC, and any tokenlist ERC20)
        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id,
          address: erc20Address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [ensResolution.address!, parsedAmount],
        });

        setTxHash(hash);
      } else {
        // ERC6909 transfer (Cookbook or Coins contract)
        const hash = await writeContractAsync({
          account: address,
          chainId: mainnet.id,
          address: selectedToken?.source === "COOKBOOK" ? CookbookAddress : CoinsAddress,
          abi: selectedToken?.source === "COOKBOOK" ? CookbookAbi : CoinsAbi,
          functionName: "transfer",
          args: [ensResolution.address!, selectedToken.id!, parsedAmount],
        });

        setTxHash(hash);
      }
    } catch (error) {
      console.error("Send transaction error:", error);

      if (isUserRejectionError(error)) {
        setTxError(t("create.transaction_rejected"));
      } else {
        const errorMsg = handleWalletError(error, { t });
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

      refetchEthBalance();

      setTimeout(() => {
        refetchEthBalance();
      }, 1500);
    }
  }, [isSuccess, txHash, refetchEthBalance]);

  const percentOfBalance = useMemo((): number => {
    if (!selectedToken.balance || selectedToken.balance === 0n || !parsedAmount) return 0;

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
            placeholder="0x... or name (vitalik.eth, name.wei)"
            className="w-full px-3 py-2 bg-input border border-border rounded focus:outline-none focus:border-accent"
          />
          {recipientAddress && (
            <div className="mt-2 space-y-1">
              {ensResolution.isLoading && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <LoadingLogo size="sm" className="scale-50" />
                  {t("swap.resolving_name") || "Resolving name..."}
                </p>
              )}
              {ensResolution.error && <p className="text-sm text-destructive font-bold">⚠ {ensResolution.error}</p>}
              {ensResolution.address && (
                <p className="text-sm text-muted-foreground">
                  {ensResolution.isENS || ensResolution.isWei ? (
                    <>
                      <span className="text-chart-2 font-bold">{ensResolution.isWei ? ".wei:" : "ENS:"}</span>{" "}
                      {recipientAddress} <span className="text-muted-foreground">→</span>{" "}
                      {ensResolution.address?.slice(0, 6)}...
                      {ensResolution.address?.slice(-4)}
                    </>
                  ) : (
                    <>
                      ✓ Valid address: {ensResolution.address?.slice(0, 6)}...{ensResolution.address?.slice(-4)}
                    </>
                  )}
                </p>
              )}
              {isSelfSend && (
                <p className="text-sm text-amber-500 font-bold">
                  ⚠ {t("send.self_send_warning") || "Warning: You are sending to your own address"}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-5">
          <label className="block text-sm font-bold mb-2 font-body">{t("create.asset_to_send").toUpperCase()}:</label>
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
              <span className="text-sm font-bold font-body">{t("lockup.mode").toUpperCase()}</span>
            </label>
          </div>
          {isLockupMode && (
            <div className="mt-3">
              <label className="block text-sm font-bold mb-2 font-body">{t("lockup.unlock_time").toUpperCase()}:</label>
              <input
                type="datetime-local"
                value={unlockTime}
                onChange={(e) => setUnlockTime(e.target.value)}
                min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                className="w-full px-3 py-2 bg-input border border-border rounded focus:outline-none focus:border-accent"
              />
              {unlockTime && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("lockup.tokens_locked_until", {
                    date: new Date(unlockTime).toLocaleString(),
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mb-5">
          <div className="flex justify-between items-center mb-2">
            <label className="block text-sm font-bold font-body">{t("create.amount").toUpperCase()}:</label>
            <button
              type="button"
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
                <span className="text-xs ml-1 inline-block text-accent animate-spin">⟳</span>
              )}
            </div>
          </div>

          <div className="mt-2 text-xs font-bold font-body flex justify-between">
            <span>
              {amount && percentOfBalance > 100 ? (
                <span className="text-destructive">⚠ {t("create.insufficient_balance").toUpperCase()}</span>
              ) : amount ? (
                `${percentOfBalance.toFixed(0)}${t("create.percent_of_balance")}`
              ) : (
                <span className="text-muted-foreground">{t("send.enter_amount") || "Enter amount"}</span>
              )}
            </span>
            <span className={selectedToken.isFetching ? "animate-pulse" : ""}>
              {t("create.balance").toUpperCase()}:{" "}
              {selectedToken.isFetching ? (
                <span className="text-muted-foreground">...</span>
              ) : (
                <>
                  {formatTokenBalance(selectedToken)} {safeStr(selectedToken.symbol)}
                </>
              )}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={isConnected && (!canSend || isPending)}
          className="w-full py-4 text-base font-bold uppercase bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted rounded flex items-center justify-center gap-2"
        >
          {!isConnected ? (
            <span>{t("common.connect_wallet") || "CONNECT WALLET"}</span>
          ) : isPending ? (
            <>
              <LoadingLogo size="sm" />
              <span>{isLockupMode ? t("lockup.locking_up").toUpperCase() : t("create.sending").toUpperCase()}</span>
            </>
          ) : (
            <>
              <span>{isLockupMode ? t("lockup.lockup").toUpperCase() : t("create.send").toUpperCase()}</span>
              <span className="text-primary-foreground/80">{isLockupMode ? "🔒" : "🪁"}</span>
            </>
          )}
        </button>

        {txHash && (
          <div className="mt-4 p-3 border-2 border-accent bg-card font-body">
            <p className="text-sm font-bold">
              <span className="text-accent">
                {isSuccess
                  ? `✓ ${isLockupMode ? t("lockup.lockup_successful").toUpperCase() : t("create.transaction_successful").toUpperCase()}`
                  : `⏳ ${isLockupMode ? t("lockup.lockup_submitted").toUpperCase() : t("create.transaction_submitted").toUpperCase()}`}
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
              ⚠ {t("create.loading_error").toUpperCase()}: {loadError.toUpperCase()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const SendTile = memo(SendTileComponent);
