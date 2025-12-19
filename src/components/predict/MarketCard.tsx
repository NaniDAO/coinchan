import React, { useState, useEffect, useMemo } from "react";
import { formatEther, parseEther } from "viem";
import {
  useEnsName,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
} from "wagmi";
import { mainnet } from "wagmi/chains";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TradeModal } from "./TradeModal";
import { MarketCountdown } from "./MarketCountdown";
import { ResolverControls } from "./ResolverControls";
import { PAMMSingletonAbi, PAMMSingletonAddress, ZAMM_ADDRESS } from "@/constants/PAMMSingleton";
import { ExternalLink, BadgeCheck, Copy, Check, Sparkles, Share2, Star } from "lucide-react";
import { formatImageURL } from "@/hooks/metadata";
import {
  isTrustedResolver,
  isPerpetualOracleResolver,
  getTrustedResolver,
  CATEGORY_INFO,
  type MarketCategory,
} from "@/constants/TrustedResolvers";
import { extractOracleMetadata } from "@/lib/perpetualOracleUtils";
import ReactMarkdown from "react-markdown";
import { isUserRejectionError } from "@/lib/errors";
import { Link } from "@tanstack/react-router";

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
  contractAddress?: `0x${string}`;
  rYes?: bigint;
  rNo?: bigint;
  category?: MarketCategory;
  isOracleMarket?: boolean;
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
  contractAddress = PAMMSingletonAddress,
  rYes,
  rNo,
  category,
  isOracleMarket = false,
  onClaimSuccess,
}) => {
  const [metadata, setMetadata] = useState<MarketMetadata | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [initialPosition, setInitialPosition] = useState<"yes" | "no">("yes");

  // Favorites management
  const [isFavorite, setIsFavorite] = useState(() => {
    const favorites = JSON.parse(localStorage.getItem("favoriteMarkets") || "[]");
    return favorites.includes(marketId.toString());
  });

  const toggleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem("favoriteMarkets") || "[]");
    const marketIdStr = marketId.toString();
    const newFavorites = isFavorite
      ? favorites.filter((id: string) => id !== marketIdStr)
      : [...favorites, marketIdStr];
    localStorage.setItem("favoriteMarkets", JSON.stringify(newFavorites));
    setIsFavorite(!isFavorite);
    toast.success(isFavorite ? "Removed from favorites" : "Added to favorites");
    // Notify MarketGallery to update favorites count
    window.dispatchEvent(new CustomEvent("favoriteToggled"));
  };

  // Share functionality
  const handleShare = async () => {
    const url = `${window.location.origin}/predict/amm/${marketId}`;
    const text = `Check out this prediction market: ${metadata?.name || "Prediction Market"}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: metadata?.name || "Market", text, url });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Share failed:", err);
        }
      }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    }
  };
  const { address } = useAccount();

  // CRITICAL: For PAMM markets, we need to calculate circulating supply (excludes PAMM + ZAMM)
  // Get noId first
  const { data: noId } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "getNoId",
    args: [marketId],
  });

  // Fetch balances held by PAMM and ZAMM to calculate true circulating supply
  const { data: excludedBalances } = useReadContracts({
    contracts: [
      {
        address: PAMMSingletonAddress,
        abi: PAMMSingletonAbi,
        functionName: "balanceOf",
        args: [PAMMSingletonAddress, marketId], // PAMM's YES balance
      },
      {
        address: PAMMSingletonAddress,
        abi: PAMMSingletonAbi,
        functionName: "balanceOf",
        args: [ZAMM_ADDRESS, marketId], // ZAMM's YES balance
      },
      {
        address: PAMMSingletonAddress,
        abi: PAMMSingletonAbi,
        functionName: "balanceOf",
        args: [PAMMSingletonAddress, noId ?? 0n], // PAMM's NO balance
      },
      {
        address: PAMMSingletonAddress,
        abi: PAMMSingletonAbi,
        functionName: "balanceOf",
        args: [ZAMM_ADDRESS, noId ?? 0n], // ZAMM's NO balance
      },
    ],
    query: {
      enabled: !!noId,
    },
  });

  // Calculate TRUE circulating supply (matches PAMM.sol _circulating function)
  const pammYesBal = excludedBalances?.[0]?.result ?? 0n;
  const zammYesBal = excludedBalances?.[1]?.result ?? 0n;
  const pammNoBal = excludedBalances?.[2]?.result ?? 0n;
  const zammNoBal = excludedBalances?.[3]?.result ?? 0n;

  const yesCirculating = yesSupply - pammYesBal - zammYesBal;
  const noCirculating = noSupply - pammNoBal - zammNoBal;

  // CRITICAL: Fetch resolver fee (deducts this from pot before payout)
  const { data: resolverFeeBps } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "resolverFeeBps",
    args: [resolver as `0x${string}`],
    query: {
      enabled: !!resolver,
    },
  });

  // Apply resolver fee to pot (matching PAMM.sol line 779)
  const feeBps = resolverFeeBps ?? 0;
  const potAfterFee = pot > 0n && feeBps > 0 ? (pot * BigInt(10000 - feeBps)) / 10000n : pot;

  // Track which transactions we've already shown toasts for to prevent duplicates
  const toastedClaim = React.useRef<string | null>(null);
  const toastedClaimError = React.useRef<any>(null);

  const { writeContract, data: claimHash, error: claimError } = useWriteContract();
  const { isSuccess: isClaimSuccess } = useWaitForTransactionReceipt({
    hash: claimHash,
  });

  const { data: ensName } = useEnsName({
    address: resolver as `0x${string}`,
    chainId: mainnet.id,
  });

  const isTrusted = isTrustedResolver(resolver);
  const isPerpetualOracle = isPerpetualOracleResolver(resolver);
  const trustedResolverInfo = getTrustedResolver(resolver);


  // Fetch market details to get closing time and canAccelerateClosing
  const { data: marketData, refetch: refetchMarketData } = useReadContract({
    address: PAMMSingletonAddress,
    abi: PAMMSingletonAbi,
    functionName: "markets",
    args: [marketId],
  });

  // PAMM markets: [resolver, resolved, outcome, canClose, close, collateral, collateralLocked]
  const canAccelerateClosing = marketData ? Boolean(marketData[3]) : false;

  // Get closing time from market data
  const closingTime = useMemo(() => {
    const explicitClosingTime = marketData ? Number(marketData[4]) : undefined;
    return explicitClosingTime || undefined;
  }, [marketData]);

  // Calculate accurate payout per share: pot / winning shares
  // Use circulating supply (excludes PAMM + ZAMM, calculated at lines 202-203)
  // which correctly excludes BOTH PAMM and ZAMM holdings per PAMM.sol _circulating()
  const winningShares = outcome ? yesCirculating : noCirculating;

  const calculatedPayoutPerShare =
    resolved && winningShares > 0n
      ? (potAfterFee * BigInt(1e18)) / winningShares // Use potAfterFee (after resolver fee), scale by Q=1e18
      : payoutPerShare; // Fallback to contract value if not resolved or no winning shares

  const isClosed = closingTime ? Date.now() / 1000 >= closingTime : false;
  const isTradingDisabled = resolved || isClosed;

  const hasPosition = userYesBalance > 0n || userNoBalance > 0n;
  const canClaim = resolved && userClaimable > 0n;

  const handleClaim = () => {
    if (!address) {
      toast.error("Please connect your wallet");
      return;
    }
    writeContract({
      address: PAMMSingletonAddress,
      abi: PAMMSingletonAbi,
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
      const errorMessage = (claimError as any)?.shortMessage ?? claimError?.message ?? "";
      toast.error(errorMessage || "Claim failed");
    }
  }, [claimError]);


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
              filePath = files.find((f) => /\.(jpg|jpeg|png|gif|svg|webp)$/i.test(f));

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
                  imageUrl = imageUrl.endsWith("/") ? imageUrl + filePath : imageUrl + "/" + filePath;
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

  if (rYes !== undefined && rNo !== undefined) {
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
    // Fallback: use supply ratio if reserves not available
    const totalSupply = yesSupply + noSupply;
    yesPercent = totalSupply > 0n ? (Number(yesSupply) / Number(totalSupply)) * 100 : 50;
    noPercent = 100 - yesPercent;
  }

  return (
    <>
      <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-xl hover:border-border/80 transition-all duration-300 group">
        {/* Image Header with Overlay */}
        <div className="relative">
          {metadata.image && !imageError ? (
            <img
              src={metadata.image}
              alt={metadata.name}
              className="w-full h-40 object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-40 bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 flex items-center justify-center">
              <span className="text-5xl">🔮</span>
            </div>
          )}

          {/* Market Type Badge - Floating on Image */}
          <div className="absolute top-3 right-3">
            <Badge className="bg-blue-500/90 hover:bg-blue-500 backdrop-blur-sm text-white border-0 font-semibold shadow-lg">
              PAMM
            </Badge>
          </div>

          {/* Resolved Badge - Floating on Image */}
          {resolved && (
            <div className="absolute top-3 left-3">
              <Badge
                className={`${
                  outcome
                    ? "bg-green-500/90 backdrop-blur-sm text-white border-0"
                    : "bg-red-500/90 backdrop-blur-sm text-white border-0"
                } font-semibold shadow-lg`}
              >
                {outcome ? "✓ YES WON" : "✗ NO WON"}
              </Badge>
            </div>
          )}

          {/* Quick Trade Buttons - Appears on Hover (only for active markets) */}
          {!resolved && !isTradingDisabled && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end p-4">
              <div className="w-full grid grid-cols-2 gap-2">
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInitialPosition("yes");
                    setIsModalOpen(true);
                  }}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-6 text-base shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  Buy YES
                </Button>
                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setInitialPosition("no");
                    setIsModalOpen(true);
                  }}
                  className="bg-rose-500 hover:bg-rose-600 text-white font-bold py-6 text-base shadow-lg hover:shadow-xl transition-all"
                  size="lg"
                >
                  Buy NO
                </Button>
              </div>
            </div>
          )}

          {/* Action Buttons - Share and Favorite */}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleShare();
              }}
              variant="secondary"
              size="sm"
              className="h-8 w-8 p-0 bg-background/95 hover:bg-accent hover:text-accent-foreground border border-border/50 backdrop-blur-sm shadow-lg transition-all"
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite();
              }}
              variant="secondary"
              size="sm"
              className={`h-8 w-8 p-0 backdrop-blur-sm shadow-lg transition-all ${
                isFavorite
                  ? "bg-amber-500 hover:bg-amber-600 text-white border border-amber-600/50"
                  : "bg-background/95 hover:bg-accent hover:text-accent-foreground border border-border/50"
              }`}
            >
              <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Title Section */}
          <div>
            {/* Category & Oracle Badges */}
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              {/* Oracle Badge (Gold) - Resolver Singleton markets */}
              {isOracleMarket && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      <span className="text-amber-500">*</span>
                      Oracle
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">
                      Verified onchain oracle - resolves automatically via smart contract
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
              {/* Category Badge */}
              {category && CATEGORY_INFO[category] && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted/50 ${CATEGORY_INFO[category].color} border border-border/50`}
                    >
                      <span>{CATEGORY_INFO[category].icon}</span>
                      {CATEGORY_INFO[category].label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">{CATEGORY_INFO[category].description}</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <Link
              to="/predict/$marketType/$marketId"
              params={{
                marketType: "amm",
                marketId: marketId.toString(),
              }}
              className="block group/link"
            >
              <h3 className="font-bold text-base line-clamp-2 group-hover/link:text-primary transition-colors">
                {metadata.name}
              </h3>
            </Link>
            {metadata.description && (
              <div>
                <div
                  className={`text-xs text-muted-foreground markdown-content transition-all ${
                    isDescriptionExpanded ? "max-h-96 overflow-y-auto" : "line-clamp-3"
                  }`}
                >
                  <ReactMarkdown
                    components={{
                      // Customize rendering to fit card design
                      p: ({ children }: { children?: React.ReactNode }) => <p className="mb-1 last:mb-0">{children}</p>,
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
                      }) => <strong className="font-semibold text-foreground">{children}</strong>,
                      em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
                      code: ({ children }: { children?: React.ReactNode }) => (
                        <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                      ),
                      ul: ({ children }: { children?: React.ReactNode }) => (
                        <ul className="list-disc list-inside space-y-0.5">{children}</ul>
                      ),
                      ol: ({ children }: { children?: React.ReactNode }) => (
                        <ol className="list-decimal list-inside space-y-0.5">{children}</ol>
                      ),
                      li: ({ children }: { children?: React.ReactNode }) => <li className="text-xs">{children}</li>,
                      h1: ({ children }: { children?: React.ReactNode }) => (
                        <h1 className="text-base font-bold mt-2 mb-1">{children}</h1>
                      ),
                      h2: ({ children }: { children?: React.ReactNode }) => (
                        <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>
                      ),
                      h3: ({ children }: { children?: React.ReactNode }) => (
                        <h3 className="text-xs font-semibold mt-1 mb-0.5">{children}</h3>
                      ),
                      blockquote: ({
                        children,
                      }: {
                        children?: React.ReactNode;
                      }) => <blockquote className="border-l-2 border-primary pl-2 italic my-1">{children}</blockquote>,
                    }}
                  >
                    {metadata.description}
                  </ReactMarkdown>
                </div>
                <button
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  className="text-xs text-primary hover:underline mt-1 focus:outline-none"
                >
                  {isDescriptionExpanded ? "Show less" : "Read more..."}
                </button>
              </div>
            )}
          </div>

          {closingTime && <MarketCountdown closingTime={closingTime} resolved={resolved} />}

          {/* Perpetual Oracle Info - Timing and Rules */}
          {isPerpetualOracle && metadata && (metadata as any).resolveTime && (
            <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
                  Automated Oracle Market
                </span>
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {(metadata as any).resolveTime && (
                  <div className="flex justify-between">
                    <span>Resolves:</span>
                    <span className="font-mono">
                      {new Date((metadata as any).resolveTime * 1000).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                )}
                {(metadata as any).rules && (
                  <div className="pt-0.5 text-[11px] italic opacity-80">{(metadata as any).rules}</div>
                )}
              </div>
            </div>
          )}

          {/* Odds Display - Enhanced for Active Markets */}
          {!resolved && (
            <div className="bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg p-3 space-y-2 border border-border/50">
              <div className="flex justify-between items-center text-sm font-semibold">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                  <span className="text-emerald-600 dark:text-emerald-400">YES {yesPercent.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-rose-600 dark:text-rose-400">NO {noPercent.toFixed(2)}%</span>
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                </div>
              </div>
              <div className="flex h-3 rounded-full overflow-hidden bg-muted/50 shadow-inner">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500"
                  style={{ width: `${yesPercent}%` }}
                />
                <div
                  className="bg-gradient-to-r from-rose-500 to-rose-600 transition-all duration-500"
                  style={{ width: `${noPercent}%` }}
                />
              </div>
              {/* Pool/Supply Information */}
              <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                <span>
                  Pool YES: {Number(formatEther(rYes !== undefined ? rYes : yesSupply)).toFixed(2)}
                </span>
                <span>
                  Pool NO: {Number(formatEther(rNo !== undefined ? rNo : noSupply)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Market Info Section */}
          <div className="space-y-2">
            {/* User Position - Highlighted */}
            {hasPosition && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-semibold text-sm">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                  Your Position
                </div>
                <div className="space-y-1.5 text-xs">
                  {userYesBalance > 0n && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">YES shares</span>
                      <span className="font-mono font-semibold">{Number(formatEther(userYesBalance)).toFixed(4)}</span>
                    </div>
                  )}
                  {userNoBalance > 0n && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">NO shares</span>
                      <span className="font-mono font-semibold">{Number(formatEther(userNoBalance)).toFixed(4)}</span>
                    </div>
                  )}

                  {/* PAMM Position Info - Only for markets with active positions */}
                  {!resolved && pot > 0n && (
                    <>
                      {userYesBalance > 0n &&
                        yesCirculating > 0n &&
                        (() => {
                          // Formula matches PAMM.sol: payoutPerShare = mulDiv(pot, Q, winningCirc) where Q = 1e18
                          // CRITICAL: Use yesCirculating (excludes PAMM + ZAMM), not yesSupply
                          // CRITICAL: Use potAfterFee (after resolver fee), not pot
                          const Q = parseEther("1");
                          const payoutPerShare = (potAfterFee * Q) / yesCirculating;
                          return (
                            <div className="pt-1.5 border-t border-blue-200/50 dark:border-blue-800/50 space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-muted-foreground">Current payout/share (YES)</span>
                                <span className="font-mono text-blue-700 dark:text-blue-300">
                                  {Number(formatEther(payoutPerShare)).toFixed(4)} wstETH
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                      {userNoBalance > 0n &&
                        noCirculating > 0n &&
                        (() => {
                          // Formula matches PAMM.sol: payoutPerShare = mulDiv(pot, Q, winningCirc) where Q = 1e18
                          // CRITICAL: Use noCirculating (excludes PAMM + ZAMM), not noSupply
                          // CRITICAL: Use potAfterFee (after resolver fee), not pot
                          const Q = parseEther("1");
                          const payoutPerShare = (potAfterFee * Q) / noCirculating;
                          return (
                            <div className="pt-1.5 border-t border-blue-200/50 dark:border-blue-800/50 space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-muted-foreground">Current payout/share (NO)</span>
                                <span className="font-mono text-blue-700 dark:text-blue-300">
                                  {Number(formatEther(payoutPerShare)).toFixed(4)} wstETH
                                </span>
                              </div>
                            </div>
                          );
                        })()}
                    </>
                  )}

                  {canClaim && (
                    <div className="flex justify-between items-center pt-1.5 border-t border-blue-200/50 dark:border-blue-800/50">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">Claimable</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {Number(formatEther(userClaimable)).toFixed(4)} wstETH
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Total Pool/Pot - Prominent Display */}
            <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground font-medium">Total Pot (wstETH)</span>
                <span className="font-mono font-bold text-sm">{Number(formatEther(pot)).toFixed(4)}</span>
              </div>
            </div>
            {/* Resolved Market Stats */}
            {resolved && calculatedPayoutPerShare > 0n && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Winning Side</span>
                  <span
                    className={`font-bold ${outcome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                  >
                    {outcome ? "YES" : "NO"}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Winning Shares</span>
                  <span className="font-mono font-semibold">{Number(formatEther(winningShares)).toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center pt-1.5 border-t border-border/30">
                  <span className="text-muted-foreground font-medium">Payout Per Share</span>
                  <span className="font-mono font-bold">
                    {Number(formatEther(calculatedPayoutPerShare)).toFixed(4)} wstETH
                  </span>
                </div>
              </div>
            )}

            {/* Resolver Information */}
            <div className="bg-muted/20 rounded-lg p-2.5 border border-border/40">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-medium">Resolver</span>
                <div className="flex items-center gap-1.5">
                  <a
                    href={`https://etherscan.io/address/${resolver}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-primary transition-colors font-mono"
                    title={resolver}
                  >
                    {/* Prefer ENS name over generic "Trusted Resolver #X" labels */}
                    {ensName ||
                      (trustedResolverInfo?.name && !trustedResolverInfo.name.startsWith("Trusted Resolver #")
                        ? trustedResolverInfo.name
                        : null) ||
                      `${resolver.slice(0, 6)}...${resolver.slice(-4)}`}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  {trustedResolverInfo && trustedResolverInfo.description ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help">
                          {isPerpetualOracle ? (
                            <BadgeCheck className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                          ) : (
                            <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs max-w-xs">{trustedResolverInfo.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : isPerpetualOracle ? (
                    <span title="Perpetual Oracle Resolver">
                      <BadgeCheck className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                    </span>
                  ) : isTrusted ? (
                    <BadgeCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  ) : null}
                </div>
              </div>
            </div>

            {/* Market ID - Compact */}
            <button
              onClick={handleCopyMarketId}
              className="w-full flex items-center justify-between px-2.5 py-1.5 bg-muted/10 hover:bg-muted/20 rounded border border-border/30 hover:border-border/60 transition-all group text-xs"
              title="Click to copy Market ID"
            >
              <span className="text-muted-foreground/60 group-hover:text-muted-foreground font-medium">Market ID</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-muted-foreground/80 group-hover:text-foreground">
                  {marketId.toString().slice(0, 8)}...{marketId.toString().slice(-6)}
                </span>
                {isCopied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                )}
              </div>
            </button>
          </div>

          {/* Resolver Controls - only shown to the resolver */}
          {closingTime && (
            <ResolverControls
              marketId={marketId}
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

          {/* Action Buttons */}
          <div className="pt-2 border-t border-border/50">
            {canClaim ? (
              <Button
                onClick={handleClaim}
                className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold shadow-md hover:shadow-lg transition-all"
                size="lg"
              >
                <span className="text-base">Claim {Number(formatEther(userClaimable)).toFixed(4)} wstETH</span>
              </Button>
            ) : isTradingDisabled ? (
              <Button className="w-full" size="lg" disabled={true} variant="outline">
                {resolved ? "Market Resolved" : "Market Closed"}
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => {
                    setInitialPosition("yes");
                    setIsModalOpen(true);
                  }}
                  className="bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold flex flex-col items-center py-3 h-auto transition-all shadow-sm hover:shadow-md border-0"
                  size="sm"
                >
                  <span className="text-base">YES</span>
                  <span className="text-xs font-normal opacity-90">{yesPercent.toFixed(2)}%</span>
                </Button>
                <Button
                  onClick={() => {
                    setInitialPosition("no");
                    setIsModalOpen(true);
                  }}
                  className="bg-gradient-to-br from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold flex flex-col items-center py-3 h-auto transition-all shadow-sm hover:shadow-md border-0"
                  size="sm"
                >
                  <span className="text-base">NO</span>
                  <span className="text-xs font-normal opacity-90">{noPercent.toFixed(2)}%</span>
                </Button>
              </div>
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
        contractAddress={contractAddress}
        resolver={resolver}
        initialPosition={initialPosition}
        onTransactionSuccess={() => {
          // Refetch market data to update odds/reserves after transactions
          refetchMarketData();
          if (onClaimSuccess) onClaimSuccess();
        }}
      />
    </>
  );
};
