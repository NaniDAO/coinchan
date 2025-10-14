import React, { useState, useEffect } from "react";
import { formatEther } from "viem";
import {
  useEnsName,
  useReadContract,
  useBytecode,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { mainnet } from "wagmi/chains";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeModal } from "./TradeModal";
import { MarketCountdown } from "./MarketCountdown";
import { ResolverControls } from "./ResolverControls";
import {
  PredictionMarketAddress,
  PredictionMarketAbi,
} from "@/constants/PredictionMarket";
import {
  PredictionAMMAbi,
  PredictionAMMAddress,
} from "@/constants/PredictionMarketAMM";
import {
  ExternalLink,
  BadgeCheck,
  ArrowUpRight,
  Copy,
  Check,
  Sparkles,
  Coins,
} from "lucide-react";
import { formatImageURL } from "@/hooks/metadata";
import {
  isTrustedResolver,
  isPerpetualOracleResolver,
  ETH_WENT_UP_RESOLVER_ADDRESS,
  COINFLIP_RESOLVER_ADDRESS,
  NOUNS_PASS_VOTING_RESOLVER_ADDRESS,
} from "@/constants/TrustedResolvers";
import { extractOracleMetadata } from "@/lib/perpetualOracleUtils";
import { EthWentUpResolverAbi } from "@/constants/EthWentUpResolver";
import { CoinflipResolverAbi } from "@/constants/CoinflipResolver";
import { NounsPassVotingResolverAbi } from "@/constants/NounsPassVotingResolver";
import { useBalance } from "wagmi";
import ReactMarkdown from "react-markdown";
import { isUserRejectionError } from "@/lib/errors";
import { Link } from "@tanstack/react-router";
import { encodeTokenQ } from "@/lib/token-query";
import { calculateNoTokenId } from "@/lib/pamm";

interface MarketMetadata {
  name: string;
  symbol: string;
  description?: string;
  image: string;
}

interface MarketCardProps {
  marketId: bigint;
  yesSupply: bigint;
  noSupply: bigint;
  resolver: string;
  resolved: boolean;
  outcome: boolean;
  pot: bigint;
  payoutPerShare: bigint;
  description: string;
  closingTime?: number;
  userYesBalance?: bigint;
  userNoBalance?: bigint;
  userClaimable?: bigint;
  marketType?: "parimutuel" | "amm";
  contractAddress?: `0x${string}`;
  rYes?: bigint;
  rNo?: bigint;
  onClaimSuccess?: () => void;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  marketId,
  yesSupply,
  noSupply,
  resolver,
  resolved,
  outcome,
  pot,
  payoutPerShare,
  description,
  userYesBalance = 0n,
  userNoBalance = 0n,
  userClaimable = 0n,
  marketType = "parimutuel",
  contractAddress = PredictionMarketAddress,
  rYes,
  rNo,
  onClaimSuccess,
}) => {
  const [metadata, setMetadata] = useState<MarketMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { address } = useAccount();

  // Track which transactions we've already shown toasts for to prevent duplicates
  const toastedClaim = React.useRef<string | null>(null);
  const toastedResolve = React.useRef<string | null>(null);
  const toastedTip = React.useRef<string | null>(null);
  const toastedClaimError = React.useRef<any>(null);
  const toastedResolveError = React.useRef<any>(null);
  const toastedTipError = React.useRef<any>(null);

  const {
    writeContract,
    data: claimHash,
    error: claimError,
  } = useWriteContract();
  const { isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
  });

  const { data: ensName } = useEnsName({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  // Check if resolver is a contract (oracle)
  const { data: bytecode } = useBytecode({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  const isOracle = bytecode && bytecode !== "0x";
  const isTrusted = isTrustedResolver(resolver);
  const isPerpetualOracle = isPerpetualOracleResolver(resolver);
  const isEthWentUpResolver =
    resolver.toLowerCase() === ETH_WENT_UP_RESOLVER_ADDRESS.toLowerCase();
  const isCoinflipResolver =
    resolver.toLowerCase() === COINFLIP_RESOLVER_ADDRESS.toLowerCase();
  const isNounsResolver =
    resolver.toLowerCase() === NOUNS_PASS_VOTING_RESOLVER_ADDRESS.toLowerCase();

  // Check ETH balance in resolver for tip button
  const { data: resolverBalance } = useBalance({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    query: {
      enabled: isEthWentUpResolver,
    },
  });

  // Fetch tip amount from resolver
  const { data: tipPerResolve } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "tipPerResolve",
    query: {
      enabled: isEthWentUpResolver,
    },
  });

  // Check if EthWentUp market can be resolved using canResolveNow()
  const { data: ethWentUpCanResolveData } = useReadContract({
    address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
    abi: EthWentUpResolverAbi,
    functionName: "canResolveNow",
    query: {
      enabled: isEthWentUpResolver && !resolved,
    },
  });

  const canResolve = Boolean(
    isEthWentUpResolver &&
      !resolved &&
      ethWentUpCanResolveData &&
      ethWentUpCanResolveData[0] === true, // ready
  );

  // Show tip button if balance is low (less than 2x tipPerResolve)
  const showTipButton = Boolean(
    isEthWentUpResolver &&
      resolverBalance &&
      tipPerResolve &&
      resolverBalance.value < tipPerResolve * 2n,
  );

  // Check ETH balance in CoinflipResolver for tip button
  const { data: coinflipResolverBalance } = useBalance({
    address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
    query: {
      enabled: isCoinflipResolver,
    },
  });

  // Fetch tip amount from CoinflipResolver
  const { data: coinflipTipPerResolve } = useReadContract({
    address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
    abi: CoinflipResolverAbi,
    functionName: "tipPerResolve",
    query: {
      enabled: isCoinflipResolver,
    },
  });

  // Check if coinflip market can be resolved using canResolveNow()
  const { data: coinflipCanResolveData } = useReadContract({
    address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
    abi: CoinflipResolverAbi,
    functionName: "canResolveNow",
    query: {
      enabled: isCoinflipResolver && !resolved,
    },
  });

  const canResolveCoinflip = Boolean(
    isCoinflipResolver &&
      !resolved &&
      coinflipCanResolveData &&
      coinflipCanResolveData[0] === true, // ready
  );

  // Show tip button for Coinflip if balance is low
  const showCoinflipTipButton = Boolean(
    isCoinflipResolver &&
      coinflipResolverBalance &&
      coinflipTipPerResolve &&
      coinflipResolverBalance.value < coinflipTipPerResolve * 2n,
  );

  // Extract Nouns proposal ID from metadata for contract calls
  const nounsProposalId =
    isNounsResolver && metadata && (metadata as any).nounsProposalId
      ? BigInt((metadata as any).nounsProposalId)
      : undefined;

  // Check ETH balance in NounsPassVotingResolver for tip button
  const { data: nounsResolverBalance } = useBalance({
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
    query: {
      enabled: isNounsResolver,
    },
  });

  // Fetch tip amount from NounsPassVotingResolver
  const { data: nounsTipPerAction } = useReadContract({
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
    abi: NounsPassVotingResolverAbi,
    functionName: "tipPerAction",
    query: {
      enabled: isNounsResolver,
    },
  });

  // Check if Nouns market can be resolved using canResolveNow(proposalId)
  const { data: nounsCanResolveData } = useReadContract({
    address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
    abi: NounsPassVotingResolverAbi,
    functionName: "canResolveNow",
    args: nounsProposalId !== undefined ? [nounsProposalId] : undefined,
    query: {
      enabled: isNounsResolver && !resolved && nounsProposalId !== undefined,
    },
  });

  const canResolveNouns = Boolean(
    isNounsResolver &&
      !resolved &&
      nounsCanResolveData &&
      nounsCanResolveData[0] === true && // ready
      nounsCanResolveData[1] === false, // not a dead market
  );

  // Show tip button for Nouns if balance is low
  const showNounsTipButton = Boolean(
    isNounsResolver &&
      nounsResolverBalance &&
      nounsTipPerAction &&
      nounsResolverBalance.value < nounsTipPerAction * 2n,
  );

  //  Resolve and tip transaction handling
  const {
    writeContract: writeResolve,
    data: resolveHash,
    isPending: isResolvePending,
    error: resolveError,
  } = useWriteContract();
  const { isSuccess: isResolveSuccess } = useWaitForTransactionReceipt({
    hash: resolveHash,
  });

  const {
    writeContract: writeTip,
    data: tipHash,
    isPending: isTipPending,
    error: tipError,
  } = useWriteContract();
  const { isSuccess: isTipSuccess } = useWaitForTransactionReceipt({
    hash: tipHash,
  });

  // Fetch market details to get closing time and canAccelerateClosing
  const { data: marketData, refetch: refetchMarketData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
    functionName: "markets",
    args: [marketId],
  });

  const closingTime = marketData ? Number(marketData[4]) : undefined;
  const canAccelerateClosing = marketData ? Boolean(marketData[5]) : false;
  const isClosed = closingTime ? Date.now() / 1000 >= closingTime : false;
  const isTradingDisabled = resolved || isClosed;

  const hasPosition = userYesBalance > 0n || userNoBalance > 0n;
  const canClaim = resolved && userClaimable > 0n;

  // Generate ZAMM swap URL for AMM markets
  const getZammUrl = () => {
    const yesId = marketId.toString();
    const noId = calculateNoTokenId(marketId);

    return {
      sellToken: encodeTokenQ({
        address: PredictionAMMAddress,
        id: BigInt(yesId),
      }),
      buyToken: encodeTokenQ({ address: PredictionAMMAddress, id: noId }),
    };
  };

  const handleClaim = () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }
    writeContract({
      address: contractAddress as `0x${string}`,
      abi: marketType === "amm" ? PredictionAMMAbi : PredictionMarketAbi,
      functionName: "claim",
      args: [marketId, address],
    });
  };

  const handleCopyMarketId = () => {
    navigator.clipboard.writeText(marketId.toString());
    setIsCopied(true);
    toast.success("Market ID copied!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleResolve = () => {
    if (isEthWentUpResolver) {
      writeResolve({
        address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
        abi: EthWentUpResolverAbi,
        functionName: "resolve",
      });
    } else if (isCoinflipResolver) {
      writeResolve({
        address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
        abi: CoinflipResolverAbi,
        functionName: "resolve",
      });
    } else if (isNounsResolver && nounsProposalId !== undefined) {
      writeResolve({
        address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
        abi: NounsPassVotingResolverAbi,
        functionName: "poke",
        args: [nounsProposalId],
      });
    }
  };

  const handleTip = () => {
    if (isEthWentUpResolver && tipPerResolve) {
      writeTip({
        address: ETH_WENT_UP_RESOLVER_ADDRESS as `0x${string}`,
        abi: EthWentUpResolverAbi,
        functionName: "fundTips",
        value: tipPerResolve,
      });
    } else if (isCoinflipResolver && coinflipTipPerResolve) {
      writeTip({
        address: COINFLIP_RESOLVER_ADDRESS as `0x${string}`,
        abi: CoinflipResolverAbi,
        functionName: "fundTips",
        value: coinflipTipPerResolve,
      });
    } else if (isNounsResolver && nounsTipPerAction) {
      writeTip({
        address: NOUNS_PASS_VOTING_RESOLVER_ADDRESS as `0x${string}`,
        abi: NounsPassVotingResolverAbi,
        functionName: "fundTips",
        value: nounsTipPerAction,
      });
    }
  };

  useEffect(() => {
    if (isClaimSuccess && claimHash && toastedClaim.current !== claimHash) {
      toastedClaim.current = claimHash;
      toast.success("Claim successful!");
      if (onClaimSuccess) onClaimSuccess();
    }
  }, [isClaimSuccess, claimHash, onClaimSuccess]);

  useEffect(() => {
    if (claimError && toastedClaimError.current !== claimError) {
      toastedClaimError.current = claimError;

      // Handle user rejection silently
      if (isUserRejectionError(claimError)) {
        return;
      }

      // Show actual errors
      const errorMessage =
        (claimError as any)?.shortMessage ?? claimError?.message ?? "";
      toast.error(errorMessage || "Claim failed");
    }
  }, [claimError]);

  useEffect(() => {
    if (
      isResolveSuccess &&
      resolveHash &&
      toastedResolve.current !== resolveHash
    ) {
      toastedResolve.current = resolveHash;
      toast.success("Market resolved! Keeper tip paid.");
      refetchMarketData();
      if (onClaimSuccess) onClaimSuccess();
    }
  }, [isResolveSuccess, resolveHash, refetchMarketData, onClaimSuccess]);

  useEffect(() => {
    if (resolveError && toastedResolveError.current !== resolveError) {
      toastedResolveError.current = resolveError;

      // Handle user rejection silently
      if (isUserRejectionError(resolveError)) {
        return;
      }

      // Show actual errors
      const errorMessage =
        (resolveError as any)?.shortMessage ?? resolveError?.message ?? "";
      toast.error(errorMessage || "Resolve failed");
    }
  }, [resolveError]);

  useEffect(() => {
    if (isTipSuccess && tipHash && toastedTip.current !== tipHash) {
      toastedTip.current = tipHash;
      toast.success(
        "Tip added successfully! Thank you for supporting keepers.",
      );
    }
  }, [isTipSuccess, tipHash]);

  useEffect(() => {
    if (tipError && toastedTipError.current !== tipError) {
      toastedTipError.current = tipError;

      // Handle user rejection silently
      if (isUserRejectionError(tipError)) {
        return;
      }

      // Show actual errors
      const errorMessage =
        (tipError as any)?.shortMessage ?? tipError?.message ?? "";
      toast.error(errorMessage || "Tip failed");
    }
  }, [tipError]);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        if (!description) return;

        // For perpetual oracle markets, use onchain description directly
        if (isPerpetualOracle) {
          const oracleMetadata = extractOracleMetadata(description);
          setMetadata(oracleMetadata);
          return;
        }

        let url = formatImageURL(description);

        const response = await fetch(url);
        const data = await response.json();

        let imageUrl = formatImageURL(data.image || "");

        // Check if the image URL might be another JSON metadata file or IPFS directory
        // This happens with some NFT metadata standards where image field points to more metadata
        if (imageUrl && !imageUrl.match(/\.(jpg|jpeg|png|gif|svg|webp)$/i)) {
          try {
            const imageResponse = await fetch(imageUrl);
            const contentType = imageResponse.headers.get("content-type");

            // Check if it's JSON metadata
            if (contentType && contentType.includes("application/json")) {
              const imageData = await imageResponse.json();

              if (imageData.image) {
                imageUrl = formatImageURL(imageData.image);
              }
            }
            // Check if it's an IPFS directory listing (HTML)
            else if (contentType && contentType.includes("text/html")) {
              const html = await imageResponse.text();

              // Extract all href values that are not data URIs, parent directories, or the current directory
              const hrefMatches = html.matchAll(/href="([^"]+)"/gi);
              const files: string[] = [];

              for (const match of hrefMatches) {
                const href = match[1];
                // Skip data URIs, parent directory (..), current directory (.), directories (ending with /), and full URLs
                if (
                  !href.startsWith("data:") &&
                  !href.startsWith("http://") &&
                  !href.startsWith("https://") &&
                  href !== ".." &&
                  href !== "." &&
                  !href.endsWith("/")
                ) {
                  files.push(href);
                }
              }

              let filePath = null;

              // First try with common image extensions
              filePath = files.find((f) =>
                /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f),
              );

              // If no match, try to find files with "image" in the name (common pattern)
              if (!filePath) {
                filePath = files.find((f) => /image/i.test(f));
              }

              // If still no match, take the first file
              if (!filePath && files.length > 0) {
                filePath = files[0];
              }

              if (filePath) {
                // Check if the path is absolute (starts with /)
                if (filePath.startsWith("/")) {
                  // Use the gateway base URL + the absolute path
                  const gatewayBase = imageUrl.split("/ipfs/")[0];
                  imageUrl = gatewayBase + filePath;
                } else {
                  // Relative path, append to the directory URL
                  imageUrl = imageUrl.endsWith("/")
                    ? imageUrl + filePath
                    : imageUrl + "/" + filePath;
                }
              }
            }
          } catch (nestedError) {
            // If fetching as JSON fails, the URL is likely a direct image, use it as-is
          }
        }

        setMetadata({
          name: data.name || "Unnamed Market",
          symbol: data.symbol || "",
          description: data.description || "",
          image: imageUrl,
        });
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
        setMetadata({
          name: "Market #" + marketId.toString(),
          symbol: "",
          description: "",
          image: "",
        });
      }
    };

    fetchMetadata();
  }, [description, marketId, isPerpetualOracle]);

  if (!metadata) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 animate-pulse">
        <div className="h-32 bg-muted rounded-lg mb-3" />
        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    );
  }

  // For AMM markets, use pool reserves for odds; for parimutuel, use total supply
  // AMM odds formula (from PAMM.sol impliedYesProb):
  //   YES probability = rNo / (rYes + rNo)
  //   NO probability = rYes / (rYes + rNo)
  // This is because reserves are inversely related to probability in a CPMM
  let yesPercent: number;
  let noPercent: number;

  if (marketType === "amm" && rYes !== undefined && rNo !== undefined) {
    const totalReserves = rYes + rNo;
    if (totalReserves > 0n) {
      // YES probability uses rNo in numerator (inverse relationship)
      // Use high precision calculation to avoid BigInt truncation
      yesPercent = (Number(rNo) / Number(totalReserves)) * 100;
      noPercent = 100 - yesPercent;
    } else {
      yesPercent = 50;
      noPercent = 50;
    }
  } else {
    // Parimutuel markets: use total supply directly
    const totalSupply = yesSupply + noSupply;
    yesPercent =
      totalSupply > 0n ? (Number(yesSupply) / Number(totalSupply)) * 100 : 50;
    noPercent = 100 - yesPercent;
  }

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
        {metadata.image && !imageError ? (
          <img
            src={metadata.image}
            alt={metadata.name}
            className="w-full h-32 object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-32 bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
            <span className="text-4xl">🔮</span>
          </div>
        )}

        <div className="p-4 space-y-3">
          <div>
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-sm line-clamp-2">
                    {metadata.name}
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] ${
                    marketType === "amm"
                      ? "border-blue-500 text-blue-600 dark:text-blue-400"
                      : "border-purple-500 text-purple-600 dark:text-purple-400"
                  }`}
                >
                  {marketType === "amm" ? "Live Bets (AMM)" : "Pari-Mutuel"}
                </Badge>
              </div>
              {resolved && (
                <Badge
                  className={`shrink-0 ${
                    outcome
                      ? "bg-green-600 dark:bg-green-500 text-white hover:bg-green-700"
                      : "bg-red-600 dark:bg-red-500 text-white hover:bg-red-700"
                  }`}
                >
                  {outcome ? "YES" : "NO"}
                </Badge>
              )}
            </div>
            {metadata.description && (
              <div>
                <div
                  className={`text-xs text-muted-foreground markdown-content transition-all ${
                    isDescriptionExpanded
                      ? "max-h-96 overflow-y-auto"
                      : "line-clamp-3"
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      // Customize rendering to fit card design
                      p: ({ children }: { children?: React.ReactNode }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      a: ({
                        children,
                        href,
                      }: {
                        children?: React.ReactNode;
                        href?: string;
                      }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {children}
                        </a>
                      ),
                      strong: ({
                        children,
                      }: {
                        children?: React.ReactNode;
                      }) => (
                        <strong className="font-semibold text-foreground">
                          {children}
                        </strong>
                      ),
                      em: ({ children }: { children?: React.ReactNode }) => (
                        <em className="italic">{children}</em>
                      ),
                      code: ({ children }: { children?: React.ReactNode }) => (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      ),
                      ul: ({ children }: { children?: React.ReactNode }) => (
                        <ul className="list-disc list-inside space-y-0.5">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }: { children?: React.ReactNode }) => (
                        <ol className="list-decimal list-inside space-y-0.5">
                          {children}
                        </ol>
                      ),
                      li: ({ children }: { children?: React.ReactNode }) => (
                        <li className="text-xs">{children}</li>
                      ),
                      h1: ({ children }: { children?: React.ReactNode }) => (
                        <h1 className="text-base font-bold mt-2 mb-1">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }: { children?: React.ReactNode }) => (
                        <h2 className="text-sm font-bold mt-2 mb-1">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }: { children?: React.ReactNode }) => (
                        <h3 className="text-xs font-semibold mt-1 mb-0.5">
                          {children}
                        </h3>
                      ),
                      blockquote: ({
                        children,
                      }: {
                        children?: React.ReactNode;
                      }) => (
                        <blockquote className="border-l-2 border-primary pl-2 italic my-1">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {metadata.description}
                  </ReactMarkdown>
                </div>
                <button
                  onClick={() =>
                    setIsDescriptionExpanded(!isDescriptionExpanded)
                  }
                  className="text-xs text-primary hover:underline mt-1 focus:outline-none"
                >
                  {isDescriptionExpanded ? "Show less" : "Read more..."}
                </button>
              </div>
            )}
          </div>

          {closingTime && (
            <MarketCountdown closingTime={closingTime} resolved={resolved} />
          )}

          {/* Perpetual Oracle Info - Timing and Rules */}
          {isPerpetualOracle &&
            metadata &&
            ((metadata as any).resolveTime ||
              (metadata as any).nounsProposalId) && (
              <div
                className={`${
                  isCoinflipResolver
                    ? "bg-blue-500/5 border border-blue-500/20"
                    : isNounsResolver
                      ? "bg-pink-500/5 border border-pink-500/20"
                      : "bg-yellow-500/5 border border-yellow-500/20"
                } rounded p-2 space-y-1`}
              >
                <div className="flex items-center gap-1.5">
                  <Sparkles
                    className={`h-3.5 w-3.5 ${
                      isCoinflipResolver
                        ? "text-blue-600 dark:text-blue-400"
                        : isNounsResolver
                          ? "text-pink-600 dark:text-pink-400"
                          : "text-yellow-600 dark:text-yellow-400"
                    }`}
                  />
                  <span
                    className={`text-xs font-semibold ${
                      isCoinflipResolver
                        ? "text-blue-700 dark:text-blue-300"
                        : isNounsResolver
                          ? "text-pink-700 dark:text-pink-300"
                          : "text-yellow-700 dark:text-yellow-300"
                    }`}
                  >
                    Automated Oracle Market
                  </span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {isNounsResolver && (metadata as any).nounsProposalId && (
                    <div className="flex justify-between">
                      <span>Proposal ID:</span>
                      <a
                        href={`https://nouns.wtf/vote/${(metadata as any).nounsProposalId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
                      >
                        #{(metadata as any).nounsProposalId}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  )}
                  {isNounsResolver && (metadata as any).nounsEvalBlock && (
                    <div className="flex justify-between">
                      <span>Eval Block:</span>
                      <span className="font-mono text-[10px]">
                        {(metadata as any).nounsEvalBlock}
                      </span>
                    </div>
                  )}
                  {(metadata as any).resolveTime && !isNounsResolver && (
                    <div className="flex justify-between">
                      <span>
                        {isCoinflipResolver ? "Closes:" : "Resolves:"}
                      </span>
                      <span className="font-mono">
                        {new Date(
                          (metadata as any).resolveTime * 1000,
                        ).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  )}
                  {isCoinflipResolver &&
                    (metadata as any).targetBlocks &&
                    (metadata as any).targetBlocks.length > 0 && (
                      <div className="flex justify-between">
                        <span>Target Blocks:</span>
                        <span className="font-mono text-[10px]">
                          {(metadata as any).targetBlocks.join(", ")}
                        </span>
                      </div>
                    )}
                  {(metadata as any).rules && (
                    <div className="pt-0.5 text-[11px] italic opacity-80">
                      {(metadata as any).rules}
                    </div>
                  )}
                </div>
              </div>
            )}

          {!resolved && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-green-600 dark:text-green-400">
                  YES {yesPercent.toFixed(2)}%
                </span>
                <span className="text-red-600 dark:text-red-400">
                  NO {noPercent.toFixed(2)}%
                </span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                <div
                  className="bg-green-600 dark:bg-green-400"
                  style={{ width: `${yesPercent}%` }}
                />
                <div
                  className="bg-red-600 dark:bg-red-400"
                  style={{ width: `${noPercent}%` }}
                />
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            {hasPosition && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2 space-y-1">
                <div className="flex justify-between">
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    Your Position:
                  </span>
                </div>
                {userYesBalance > 0n && (
                  <div className="flex justify-between">
                    <span>YES shares:</span>
                    <span className="font-mono">
                      {Number(formatEther(userYesBalance)).toFixed(4)}
                    </span>
                  </div>
                )}
                {userNoBalance > 0n && (
                  <div className="flex justify-between">
                    <span>NO shares:</span>
                    <span className="font-mono">
                      {Number(formatEther(userNoBalance)).toFixed(4)}
                    </span>
                  </div>
                )}
                {canClaim && (
                  <div className="flex justify-between">
                    <span className="font-semibold">Claimable:</span>
                    <span className="font-mono font-semibold text-green-600 dark:text-green-400">
                      {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                    </span>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between">
              <span>Total Pool:</span>
              <span className="font-mono">
                {Number(formatEther(pot)).toFixed(4)} wstETH
              </span>
            </div>
            {resolved && payoutPerShare > 0n && (
              <>
                <div className="flex justify-between">
                  <span>Winning Side:</span>
                  <span className="font-semibold">
                    {outcome ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Winning Shares:</span>
                  <span className="font-mono">
                    {Number(
                      formatEther(outcome ? yesSupply : noSupply),
                    ).toFixed(4)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Payout Per Share:</span>
                  <span className="font-mono">
                    {Number(formatEther(payoutPerShare)).toFixed(4)} wstETH
                  </span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span>Resolver:</span>
              <div className="flex items-center gap-1">
                <a
                  href={`https://etherscan.io/address/${resolver}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
                >
                  {ensName || `${resolver.slice(0, 6)}...${resolver.slice(-4)}`}
                  <ExternalLink className="h-3 w-3" />
                </a>
                {isPerpetualOracle ? (
                  <span title="Perpetual Oracle Resolver">
                    <BadgeCheck className="h-4 w-4 text-yellow-500 shrink-0" />
                  </span>
                ) : isTrusted ? (
                  <BadgeCheck className="h-4 w-4 text-blue-500 shrink-0" />
                ) : null}
                {isOracle && (
                  <Badge variant="outline" className="text-xs">
                    Oracle
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-border/50">
              <span className="text-[10px] opacity-60">Market ID:</span>
              <button
                onClick={handleCopyMarketId}
                className="flex items-center gap-1 hover:text-primary transition-colors group"
                title="Click to copy Market ID"
              >
                <span className="font-mono text-[10px] opacity-60 group-hover:opacity-100">
                  {marketId.toString().slice(0, 8)}...
                  {marketId.toString().slice(-6)}
                </span>
                {isCopied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                )}
              </button>
            </div>
          </div>

          {/* Resolver Controls - only shown to the resolver */}
          {closingTime && (
            <ResolverControls
              marketId={marketId}
              contractAddress={contractAddress}
              marketType={marketType}
              resolver={resolver}
              closingTime={closingTime}
              canAccelerateClosing={canAccelerateClosing}
              resolved={resolved}
              onSuccess={() => {
                refetchMarketData();
                if (onClaimSuccess) onClaimSuccess();
              }}
            />
          )}

          {/* Perpetual Oracle Automation - Resolve Button */}
          {(canResolve || canResolveCoinflip || canResolveNouns) && (
            <div
              className={`${
                isCoinflipResolver
                  ? "bg-blue-500/10 border border-blue-500/30"
                  : isNounsResolver
                    ? "bg-pink-500/10 border border-pink-500/30"
                    : "bg-yellow-500/10 border border-yellow-500/30"
              } rounded p-2`}
            >
              <Button
                onClick={handleResolve}
                className={`w-full ${
                  isCoinflipResolver
                    ? "bg-blue-600 hover:bg-blue-700"
                    : isNounsResolver
                      ? "bg-pink-600 hover:bg-pink-700"
                      : "bg-yellow-600 hover:bg-yellow-700"
                } text-white`}
                size="sm"
                disabled={isResolvePending}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {isResolvePending
                  ? "Resolving..."
                  : "Resolve Market (Earn Tip!)"}
              </Button>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Automated market ready. Resolve to earn{" "}
                {isCoinflipResolver
                  ? coinflipTipPerResolve
                    ? formatEther(coinflipTipPerResolve)
                    : "0.001"
                  : isNounsResolver
                    ? nounsTipPerAction
                      ? formatEther(nounsTipPerAction)
                      : "0.001"
                    : tipPerResolve
                      ? formatEther(tipPerResolve)
                      : "0.001"}{" "}
                ETH tip
              </p>
            </div>
          )}

          {/* Perpetual Oracle Tip Button - Subtle, only shown when balance is low */}
          {(showTipButton || showCoinflipTipButton || showNounsTipButton) && (
            <button
              onClick={handleTip}
              className={`w-full text-xs text-muted-foreground ${
                isCoinflipResolver
                  ? "hover:text-blue-600 dark:hover:text-blue-400"
                  : isNounsResolver
                    ? "hover:text-pink-600 dark:hover:text-pink-400"
                    : "hover:text-yellow-600 dark:hover:text-yellow-400"
              } transition-colors flex items-center justify-center gap-1 py-1 opacity-60 hover:opacity-100`}
              disabled={isTipPending}
              title="Add tip to incentivize keepers to resolve this market"
            >
              <Coins className="h-3 w-3" />
              {isTipPending
                ? "Adding tip..."
                : `Tip keepers ${
                    isCoinflipResolver
                      ? coinflipTipPerResolve
                        ? formatEther(coinflipTipPerResolve)
                        : "0.001"
                      : isNounsResolver
                        ? nounsTipPerAction
                          ? formatEther(nounsTipPerAction)
                          : "0.001"
                        : tipPerResolve
                          ? formatEther(tipPerResolve)
                          : "0.001"
                  } ETH`}
            </button>
          )}

          <div className="space-y-2">
            {canClaim ? (
              <Button
                onClick={handleClaim}
                className="w-full"
                size="sm"
                variant="default"
              >
                Claim {Number(formatEther(userClaimable)).toFixed(4)} wstETH
              </Button>
            ) : (
              <Button
                onClick={() => setIsModalOpen(true)}
                className="w-full"
                size="sm"
                disabled={isTradingDisabled}
              >
                {resolved
                  ? "Market Resolved"
                  : isClosed
                    ? "Market Closed"
                    : "Trade"}
              </Button>
            )}

            {marketType === "amm" && !resolved && (
              <Link
                to="/swap"
                search={getZammUrl}
                className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 border border-blue-500/50 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors"
              >
                Trade on ZAMM
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      <TradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        marketId={marketId}
        marketName={metadata.name}
        yesSupply={yesSupply}
        noSupply={noSupply}
        marketType={marketType}
        contractAddress={contractAddress}
        resolver={resolver}
      />
    </>
  );
};
