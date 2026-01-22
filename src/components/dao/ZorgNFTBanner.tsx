import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContracts,
} from "wagmi";
import { ZORG_NFT, ZORG_NFT_ABI } from "@/constants/ZORGNFT";
import { ZORG_BADGES_ADDRESS, ZORG_BADGES_ABI } from "@/constants/ZORGBadges";
import { Button } from "@/components/ui/button";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useCallback } from "react";
import { formatEther } from "viem";
import { useQueryClient } from "@tanstack/react-query";

const MAX_SUPPLY = 10000n;
const NFT_DISPLAY_COUNT = 6;

type Seat = {
  holder: `0x${string}`;
  bal: bigint;
};

type NFTMetadata = {
  tokenId: number;
  image: string;
  name: string;
};

const parseTokenURI = (tokenURI: string): { image: string; name: string } | null => {
  try {
    const base64Data = tokenURI.replace("data:application/json;base64,", "");
    const jsonString = atob(base64Data);
    const metadata = JSON.parse(jsonString);
    return {
      image: metadata.image || "",
      name: metadata.name || "",
    };
  } catch {
    return null;
  }
};

const downloadNFTAsPNG = async (svgDataUri: string, tokenId: number) => {
  try {
    // Create an image element to load the SVG
    const img = new Image();
    img.crossOrigin = "anonymous";

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = svgDataUri;
    });

    // Create canvas with higher resolution for quality
    const scale = 4;
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size * scale;
    canvas.height = size * scale;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    // Enable image smoothing for better quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw the image scaled up
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Convert to PNG blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
        "image/png",
        1.0
      );
    });

    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ZORG_NFT_${tokenId}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download NFT:", error);
  }
};

export const ZorgNFTBanner = () => {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const [displayedNFTs, setDisplayedNFTs] = useState<NFTMetadata[]>([]);
  const [userNFT, setUserNFT] = useState<NFTMetadata | null>(null);
  const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);

  const { data: seats, isLoading: isSeatsLoading } = useReadContract({
    address: ZORG_BADGES_ADDRESS,
    abi: ZORG_BADGES_ABI,
    functionName: "getSeats",
    query: { staleTime: 60_000 },
  });

  const { data: badgeBalance, isLoading: isBadgeLoading } = useReadContract({
    address: ZORG_BADGES_ADDRESS,
    abi: ZORG_BADGES_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: 30_000 },
  });

  const {
    data: canMint,
    isLoading: isCanMintLoading,
    refetch: refetchCanMint,
  } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "canMint",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: 5_000 },
  });

  const {
    data: totalSupply,
    isLoading: isSupplyLoading,
    refetch: refetchSupply,
  } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "totalSupply",
    query: { staleTime: 5_000 },
  });

  const { data: nftBalance, refetch: refetchNftBalance } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, staleTime: 5_000 },
  });

  // Find user's NFT by checking recent tokens
  const userHasNFT = nftBalance !== undefined && nftBalance > 0n;
  const supply = totalSupply ?? 0n;

  // Generate token IDs to check for user ownership (check last 200 tokens)
  const tokenIdsToCheckOwnership = useMemo(() => {
    if (!userHasNFT || !address || Number(supply) === 0) return [];
    const supplyNum = Number(supply);
    const checkCount = Math.min(supplyNum, 200);
    const ids: number[] = [];
    for (let i = supplyNum; i > supplyNum - checkCount && i > 0; i--) {
      ids.push(i);
    }
    return ids;
  }, [userHasNFT, address, supply]);

  // Batch check ownership of recent tokens
  const { data: ownershipResults } = useReadContracts({
    contracts: tokenIdsToCheckOwnership.map((id) => ({
      address: ZORG_NFT as `0x${string}`,
      abi: ZORG_NFT_ABI,
      functionName: "ownerOf" as const,
      args: [BigInt(id)] as const,
    })),
    query: {
      enabled: tokenIdsToCheckOwnership.length > 0 && userHasNFT,
      staleTime: 10_000,
    },
  });

  // Find user's token ID from ownership results
  const userTokenId = useMemo(() => {
    if (!ownershipResults || !address) return null;
    for (let i = 0; i < ownershipResults.length; i++) {
      const result = ownershipResults[i];
      if (
        result.status === "success" &&
        typeof result.result === "string" &&
        result.result.toLowerCase() === address.toLowerCase()
      ) {
        return tokenIdsToCheckOwnership[i];
      }
    }
    return null;
  }, [ownershipResults, address, tokenIdsToCheckOwnership]);

  // Fetch user's NFT tokenURI
  const { data: userTokenURI, refetch: refetchUserTokenURI } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "tokenURI",
    args: userTokenId ? [BigInt(userTokenId)] : undefined,
    query: {
      enabled: !!userTokenId,
      staleTime: 60_000,
    },
  });

  // Parse user's NFT
  useEffect(() => {
    if (userTokenURI && userTokenId) {
      const parsed = parseTokenURI(userTokenURI as string);
      if (parsed) {
        setUserNFT({
          tokenId: userTokenId,
          image: parsed.image,
          name: parsed.name,
        });
      }
    }
  }, [userTokenURI, userTokenId]);

  // Also check if we just minted (use mintedTokenId)
  const { data: mintedTokenURI } = useReadContract({
    address: ZORG_NFT,
    abi: ZORG_NFT_ABI,
    functionName: "tokenURI",
    args: mintedTokenId ? [mintedTokenId] : undefined,
    query: {
      enabled: !!mintedTokenId,
      staleTime: 60_000,
    },
  });

  // Parse freshly minted NFT
  useEffect(() => {
    if (mintedTokenURI && mintedTokenId) {
      const parsed = parseTokenURI(mintedTokenURI as string);
      if (parsed) {
        setUserNFT({
          tokenId: Number(mintedTokenId),
          image: parsed.image,
          name: parsed.name,
        });
      }
    }
  }, [mintedTokenURI, mintedTokenId]);

  // Generate random token IDs for gallery display
  const tokenIdsToFetch = useMemo(() => {
    const supplyNum = totalSupply ? Number(totalSupply) : 0;
    if (supplyNum === 0) return [];
    const ids: number[] = [];
    const maxToFetch = Math.min(supplyNum, NFT_DISPLAY_COUNT);
    const usedIds = new Set<number>();
    while (ids.length < maxToFetch) {
      const randomId = Math.floor(Math.random() * supplyNum) + 1;
      if (!usedIds.has(randomId)) {
        usedIds.add(randomId);
        ids.push(randomId);
      }
    }
    return ids;
  }, [totalSupply]);

  const { data: tokenURIs } = useReadContracts({
    contracts: tokenIdsToFetch.map((id) => ({
      address: ZORG_NFT as `0x${string}`,
      abi: ZORG_NFT_ABI,
      functionName: "tokenURI" as const,
      args: [BigInt(id)] as const,
    })),
    query: {
      enabled: tokenIdsToFetch.length > 0,
      staleTime: 60_000,
    },
  });

  useEffect(() => {
    if (!tokenURIs || tokenURIs.length === 0) return;
    const nfts: NFTMetadata[] = [];
    for (let i = 0; i < tokenURIs.length; i++) {
      const result = tokenURIs[i];
      if (result.status === "success" && typeof result.result === "string") {
        const parsed = parseTokenURI(result.result);
        if (parsed) {
          nfts.push({
            tokenId: tokenIdsToFetch[i],
            image: parsed.image,
            name: parsed.name,
          });
        }
      }
    }
    setDisplayedNFTs(nfts);
  }, [tokenURIs, tokenIdsToFetch]);

  const { writeContract, data: txHash, isPending, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const refreshAllData = useCallback(() => {
    refetchSupply();
    refetchCanMint();
    refetchNftBalance();
    refetchUserTokenURI();
    // Invalidate ZORG shares balance queries
    queryClient.invalidateQueries({ queryKey: ["readContract"] });
  }, [refetchSupply, refetchCanMint, refetchNftBalance, refetchUserTokenURI, queryClient]);

  useEffect(() => {
    if (isSuccess && mintedTokenId) {
      toast.success("NFT minted successfully!");
      // Refresh all data after successful mint
      setTimeout(() => {
        refreshAllData();
      }, 1000);
      reset();
    }
  }, [isSuccess, mintedTokenId, refreshAllData, reset]);

  const minBalanceNeeded = useMemo(() => {
    if (!seats || !Array.isArray(seats) || seats.length === 0) return null;
    const seatArray = seats as Seat[];
    let minBal = seatArray[0].bal;
    for (const seat of seatArray) {
      if (seat.bal < minBal) minBal = seat.bal;
    }
    return minBal;
  }, [seats]);

  const hasBadge = badgeBalance !== undefined && badgeBalance !== null && (badgeBalance as bigint) > 0n;
  const remaining = MAX_SUPPLY - supply;
  const isSoldOut = remaining <= 0n;
  const progressPercent = Number((supply * 100n) / MAX_SUPPLY);

  const handleMint = () => {
    if (!address || !canMint) return;
    const nextTokenId = supply + 1n;
    setMintedTokenId(nextTokenId);
    writeContract({
      address: ZORG_NFT,
      abi: ZORG_NFT_ABI,
      functionName: "mint",
      args: [nextTokenId],
    });
  };

  const isLoadingData = address && (isBadgeLoading || isSeatsLoading);

  // ===== COMPONENTS =====

  const BannerWrapper = ({
    children,
    accentColor = "cyan",
    large = false,
  }: {
    children: React.ReactNode;
    accentColor?: "cyan" | "neutral";
    large?: boolean;
  }) => {
    const borderColor = accentColor === "cyan" ? "border-cyan-800/30" : "border-neutral-700/40";

    return (
      <article
        className={`relative mb-4 overflow-hidden border ${borderColor}`}
        style={{
          background: "linear-gradient(180deg, #0a0a0a 0%, #050505 100%)",
          aspectRatio: large ? "16/9" : "21/9",
          maxHeight: large ? "360px" : "280px",
          borderRadius: "2px",
        }}
        role="banner"
        aria-label="ZORG NFT Banner"
      >
        {/* Animated noise drift layer */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            animation: "noiseDrift 20s linear infinite",
          }}
        />

        {/* Blueprint grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 39px, #1a4a4a 39px, #1a4a4a 40px),
              repeating-linear-gradient(90deg, transparent, transparent 39px, #1a4a4a 39px, #1a4a4a 40px),
              repeating-linear-gradient(0deg, transparent, transparent 9px, #0f3333 9px, #0f3333 10px),
              repeating-linear-gradient(90deg, transparent, transparent 9px, #0f3333 9px, #0f3333 10px)
            `,
            backgroundSize: "40px 40px, 40px 40px, 10px 10px, 10px 10px",
          }}
        />

        {/* Halftone dither */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle, #2a2a2a 0.5px, transparent 0.5px)`,
            backgroundSize: "3px 3px",
          }}
        />

        {/* Scanlines */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px, transparent 2px, transparent 3px)`,
          }}
        />

        {/* Corner marks */}
        <div className="absolute left-2.5 top-2.5">
          <div className="absolute left-0 top-0 h-[1px] w-3.5" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
          <div className="absolute left-0 top-0 h-3.5 w-[1px]" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
        </div>
        <div className="absolute right-2.5 top-2.5">
          <div className="absolute right-0 top-0 h-[1px] w-3.5" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
          <div className="absolute right-0 top-0 h-3.5 w-[1px]" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
        </div>
        <div className="absolute bottom-2.5 left-2.5">
          <div className="absolute bottom-0 left-0 h-[1px] w-3.5" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
          <div className="absolute bottom-0 left-0 h-3.5 w-[1px]" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
        </div>
        <div className="absolute bottom-2.5 right-2.5">
          <div className="absolute bottom-0 right-0 h-[1px] w-3.5" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
          <div className="absolute bottom-0 right-0 h-3.5 w-[1px]" style={{ background: "rgba(100, 100, 100, 0.4)" }} />
        </div>

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col justify-between p-3 sm:p-5">{children}</div>

        {/* System annotation */}
        <div
          className="absolute bottom-2 right-3 flex items-center gap-2"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "7px", color: "rgba(100, 100, 100, 0.5)" }}
        >
          <span>SYS.2.4.1</span>
          <span style={{ color: "rgba(80, 80, 80, 0.5)" }}>|</span>
          <span>0x7F3A</span>
        </div>

        {/* Recording indicator */}
        <div
          className="absolute bottom-2 left-3 flex items-center gap-1"
          style={{ fontFamily: "ui-monospace, monospace", fontSize: "6px", color: "rgba(100, 100, 100, 0.5)" }}
        >
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 3px #ef4444" }} />
          <span>REC 2025.01</span>
        </div>

        <style>{`
          @keyframes noiseDrift {
            0% { transform: translate(0, 0); }
            50% { transform: translate(-2%, -1%); }
            100% { transform: translate(0, 0); }
          }
        `}</style>
      </article>
    );
  };

  const UserNFTDisplay = ({ nft }: { nft: NFTMetadata }) => {
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownload = async () => {
      setIsDownloading(true);
      try {
        await downloadNFTAsPNG(nft.image, nft.tokenId);
      } finally {
        setIsDownloading(false);
      }
    };

    return (
      <div className="flex flex-1 items-center justify-center gap-4 py-2">
        <div className="relative">
          {/* Glow effect */}
          <div
            className="absolute inset-0 blur-xl"
            style={{ background: "radial-gradient(circle, rgba(34, 211, 238, 0.3) 0%, transparent 70%)" }}
          />
          {/* NFT Frame */}
          <div
            className="relative overflow-hidden"
            style={{
              width: "clamp(100px, 25vw, 160px)",
              height: "clamp(100px, 25vw, 160px)",
              borderRadius: "4px",
              border: "2px solid rgba(34, 211, 238, 0.4)",
              background: "rgba(0, 0, 0, 0.6)",
              boxShadow: "0 0 30px rgba(34, 211, 238, 0.2), inset 0 0 20px rgba(34, 211, 238, 0.1)",
            }}
          >
            <img src={nft.image} alt={nft.name} className="h-full w-full object-cover" style={{ imageRendering: "pixelated" }} />
            {/* Token ID badge */}
            <div
              className="absolute bottom-0 left-0 right-0 py-1 text-center"
              style={{
                background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.9) 100%)",
                fontFamily: "ui-monospace, monospace",
                fontSize: "10px",
                fontWeight: 600,
                color: "#22d3ee",
                letterSpacing: "0.05em",
              }}
            >
              #{nft.tokenId}
            </div>
          </div>
          {/* YOUR NFT label */}
          <div
            className="mt-2 text-center"
            style={{
              fontFamily: "'Courier New', ui-monospace, monospace",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.15em",
              color: "#22d3ee",
              textShadow: "0 0 10px rgba(34, 211, 238, 0.5)",
            }}
          >
            YOUR ZORG NFT
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="group flex flex-col items-center gap-1.5 transition-all hover:scale-105 disabled:opacity-50"
            title="Download as PNG"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[3px] border transition-all group-hover:border-cyan-400/60 group-hover:shadow-[0_0_12px_rgba(34,211,238,0.3)]"
              style={{
                background: "rgba(34, 211, 238, 0.08)",
                border: "1px solid rgba(34, 211, 238, 0.25)",
              }}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#22d3ee" }} />
              ) : (
                <Download className="h-4 w-4" style={{ color: "#22d3ee" }} />
              )}
            </div>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "7px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(34, 211, 238, 0.7)",
              }}
            >
              PNG
            </span>
          </button>

          {/* Share to X button */}
          <a
            href={`https://x.com/intent/tweet?text=${encodeURIComponent(`gm. just claimed ZORG NFT #${nft.tokenId}\n\nbadge holders can mint for free. go get yours or not.`)}&url=${encodeURIComponent("https://zamm.finance/dao")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col items-center gap-1.5 transition-all hover:scale-105"
            title="Share on X"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-[3px] border transition-all group-hover:border-neutral-400/60 group-hover:shadow-[0_0_12px_rgba(255,255,255,0.15)]"
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              {/* X logo */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" style={{ color: "#e5e5e5" }}>
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </div>
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "7px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "rgba(229, 229, 229, 0.7)",
              }}
            >
              SHARE
            </span>
          </a>
        </div>
      </div>
    );
  };

  const NFTGallery = ({ nfts }: { nfts: NFTMetadata[] }) => {
    if (nfts.length === 0) return null;
    return (
      <div className="absolute right-3 top-1/2 -translate-y-1/2 sm:right-5">
        <div className="flex gap-1.5 sm:gap-2">
          {nfts.slice(0, 4).map((nft, index) => (
            <div
              key={nft.tokenId}
              className="relative overflow-hidden"
              style={{
                width: "clamp(28px, 8vw, 44px)",
                height: "clamp(28px, 8vw, 44px)",
                borderRadius: "2px",
                border: "1px solid rgba(34, 211, 238, 0.2)",
                background: "rgba(0, 0, 0, 0.4)",
                opacity: 0.9 - index * 0.15,
                transform: `translateY(${index * 2}px)`,
              }}
            >
              <img src={nft.image} alt={nft.name} className="h-full w-full object-cover" style={{ imageRendering: "pixelated" }} />
              <div
                className="absolute bottom-0 left-0 right-0 px-0.5 py-px text-center"
                style={{
                  background: "rgba(0, 0, 0, 0.7)",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "5px",
                  color: "rgba(34, 211, 238, 0.7)",
                }}
              >
                #{nft.tokenId}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-right" style={{ fontFamily: "ui-monospace, monospace", fontSize: "6px", color: "rgba(100, 100, 100, 0.6)" }}>
          MINTED UNITS
        </div>
      </div>
    );
  };

  const MechanicalGraphic = () => (
    <svg viewBox="0 0 140 90" className="absolute right-4 top-1/2 h-16 w-24 -translate-y-1/2 sm:right-8 sm:h-24 sm:w-36" style={{ opacity: 0.15 }} fill="none" strokeWidth="0.5" aria-hidden="true">
      <g stroke="#4a7a7a">
        <rect x="15" y="68" width="30" height="8" rx="1" strokeWidth="0.6" />
        <line x1="30" y1="76" x2="30" y2="85" strokeWidth="0.4" />
        <ellipse cx="30" cy="85" rx="8" ry="2" strokeWidth="0.4" />
        <path d="M30 68 L30 55 L45 50" strokeWidth="0.7" />
        <circle cx="30" cy="55" r="3" strokeWidth="0.5" />
        <circle cx="45" cy="50" r="2.5" strokeWidth="0.5" />
        <path d="M45 50 L65 42" strokeWidth="0.7" />
        <circle cx="65" cy="42" r="3.5" strokeWidth="0.5" />
        <path d="M65 42 L85 35" strokeWidth="0.7" />
        <circle cx="85" cy="35" r="2" strokeWidth="0.5" />
        <rect x="82" y="28" width="18" height="14" rx="1.5" strokeWidth="0.6" />
        <path d="M100 31 L112 27 M100 35 L112 35 M100 39 L112 43" strokeWidth="0.4" />
        <circle cx="115" cy="35" r="1.5" strokeWidth="0.3" />
      </g>
      <rect x="8" y="22" width="115" height="68" strokeDasharray="3 5" stroke="rgba(100, 100, 100, 0.3)" strokeWidth="0.4" />
    </svg>
  );

  const TitleBar = ({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) => (
    <div className="relative mx-auto w-full max-w-xs sm:max-w-sm">
      <div className="absolute inset-0 rounded-[2px]" style={{ background: "rgba(255, 80, 80, 0.04)", transform: "translateX(1.5px)", filter: "blur(0.3px)" }} />
      <div className="absolute inset-0 rounded-[2px]" style={{ background: "rgba(80, 80, 255, 0.04)", transform: "translateX(-1.5px)", filter: "blur(0.3px)" }} />
      <div
        className="relative overflow-hidden rounded-[2px] border border-cyan-600/20 px-3 py-1.5 backdrop-blur-[2px] sm:px-5 sm:py-2"
        style={{ background: `linear-gradient(180deg, rgba(34, 211, 238, 0.08) 0%, rgba(34, 211, 238, 0.04) 50%, rgba(34, 211, 238, 0.06) 100%)` }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,80,80,0.4) 1px, rgba(0,80,80,0.4) 2px)` }} />
        <h2
          className="relative text-center"
          style={{ fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "clamp(12px, 3.5vw, 16px)", fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", textShadow: "0 0 8px rgba(34, 211, 238, 0.3)", color: "#e5e5e5" }}
        >
          {children}
        </h2>
        {subtitle && (
          <p className="relative mt-0.5 text-center" style={{ fontFamily: "ui-monospace, monospace", fontSize: "7px", letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(148, 163, 184, 0.7)" }}>
            {"// "}{subtitle}
          </p>
        )}
      </div>
    </div>
  );

  const MetadataLabel = ({ level, label }: { level: string; label: string }) => (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <span style={{ fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "9px", fontWeight: 600, letterSpacing: "0.04em", color: "#a1a1aa" }}>{level}</span>
      <span className="h-[1px] w-1.5 sm:w-2" style={{ background: "rgba(100,100,100,0.4)" }} />
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "8px", letterSpacing: "0.06em", textTransform: "uppercase", color: "#71717a" }}>{label}</span>
    </div>
  );

  const RetroProgress = ({ value, total, loading }: { value: bigint; total: bigint; loading: boolean }) => (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="relative h-1 flex-1 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(100,100,100,0.2)", borderRadius: "1px" }}>
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 9px, rgba(255,255,255,0.05) 9px, rgba(255,255,255,0.05) 10px)` }} />
        <div className="relative h-full transition-all duration-700 ease-out" style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg, #0e7490 0%, #22d3ee 60%, #67e8f9 100%)", boxShadow: "0 0 6px rgba(34, 211, 238, 0.4)" }} />
      </div>
      <span className="flex items-center" style={{ fontFamily: "ui-monospace, monospace", fontSize: "9px", minWidth: "60px", color: "#a1a1aa" }}>
        {loading ? <Loader2 className="h-3 w-3 animate-spin" style={{ color: "#6b7280" }} /> : (
          <>
            <span style={{ fontWeight: 600, color: "#e5e5e5" }}>{value.toString()}</span>
            <span style={{ color: "rgba(113, 113, 122, 0.8)" }}>/{total.toString()}</span>
          </>
        )}
      </span>
    </div>
  );

  const OrangeAccent = () => (
    <span className="inline-block" style={{ width: "4px", height: "4px", borderRadius: "1px", background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)", boxShadow: "0 0 4px rgba(249,115,22,0.6)" }} aria-hidden="true" />
  );

  const StatusIndicator = ({ status, color }: { status: string; color: "cyan" | "neutral" | "orange" }) => {
    const colorMap = { cyan: { dot: "#22d3ee", text: "#22d3ee" }, neutral: { dot: "#6b7280", text: "#71717a" }, orange: { dot: "#f97316", text: "#f97316" } };
    const colors = colorMap[color];
    return (
      <div className="flex items-center gap-1">
        <div className={color === "cyan" ? "animate-pulse" : ""} style={{ width: "4px", height: "4px", borderRadius: "50%", background: colors.dot, boxShadow: `0 0 4px ${colors.dot}` }} />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "7px", letterSpacing: "0.04em", textTransform: "uppercase", color: colors.text }}>{status}</span>
      </div>
    );
  };

  // ===== RENDER STATES =====

  if (isLoadingData) {
    return (
      <BannerWrapper accentColor="neutral">
        <div className="flex items-start justify-between">
          <MetadataLabel level="LV.1" label="INITIALIZING" />
          <StatusIndicator status="LOADING" color="neutral" />
        </div>
        {displayedNFTs.length > 0 ? <NFTGallery nfts={displayedNFTs} /> : <MechanicalGraphic />}
        <TitleBar subtitle="PLEASE WAIT">ZORG NFT</TitleBar>
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#6b7280" }} />
        </div>
      </BannerWrapper>
    );
  }

  if (!address) {
    return (
      <BannerWrapper accentColor="neutral">
        <div className="flex items-start justify-between">
          <MetadataLabel level="LV.0" label="OFFLINE" />
          <StatusIndicator status="DISCONNECTED" color="neutral" />
        </div>
        {displayedNFTs.length > 0 ? <NFTGallery nfts={displayedNFTs} /> : <MechanicalGraphic />}
        <TitleBar subtitle="CONNECT WALLET TO VIEW STATUS">ZORG NFT</TitleBar>
        <div className="space-y-1.5">
          <RetroProgress value={supply} total={MAX_SUPPLY} loading={isSupplyLoading} />
        </div>
      </BannerWrapper>
    );
  }

  if (!hasBadge) {
    if (isSoldOut) {
      return (
        <BannerWrapper accentColor="neutral">
          <div className="flex items-start justify-between">
            <MetadataLabel level="LV.X" label="CONCLUDED" />
            <StatusIndicator status="SOLD OUT" color="orange" />
          </div>
          {displayedNFTs.length > 0 ? <NFTGallery nfts={displayedNFTs} /> : <MechanicalGraphic />}
          <TitleBar subtitle="ALL UNITS CLAIMED">ZORG NFT</TitleBar>
          <div className="space-y-1.5">
            <RetroProgress value={supply} total={MAX_SUPPLY} loading={isSupplyLoading} />
          </div>
        </BannerWrapper>
      );
    }

    return (
      <BannerWrapper accentColor="neutral">
        <div className="flex items-start justify-between">
          <MetadataLabel level="LV.2" label="ACQUISITION REQUIRED" />
          <div className="flex items-center gap-1.5">
            <OrangeAccent />
            <StatusIndicator status="LOCKED" color="neutral" />
          </div>
        </div>
        {displayedNFTs.length > 0 ? <NFTGallery nfts={displayedNFTs} /> : <MechanicalGraphic />}
        <TitleBar subtitle="BADGE HOLDERS ONLY">ZORG NFT</TitleBar>
        <div className="space-y-1.5 sm:space-y-2">
          {minBalanceNeeded !== null && (
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "8px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#71717a" }}>MIN. SHARES REQ:</span>
              <span style={{ fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "10px", fontWeight: 600, color: "#22d3ee" }}>{formatEther(minBalanceNeeded)} ZORG</span>
            </div>
          )}
          <RetroProgress value={supply} total={MAX_SUPPLY} loading={isSupplyLoading} />
          {remaining <= 1000n && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <OrangeAccent />
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "8px", textTransform: "uppercase", color: "#f97316" }}>ALERT: {remaining.toString()} UNITS REMAINING</span>
            </div>
          )}
        </div>
      </BannerWrapper>
    );
  }

  if (isCanMintLoading) {
    return (
      <BannerWrapper accentColor="cyan">
        <div className="flex items-start justify-between">
          <MetadataLabel level="LV.3" label="VERIFYING" />
          <StatusIndicator status="CHECKING" color="cyan" />
        </div>
        {displayedNFTs.length > 0 ? <NFTGallery nfts={displayedNFTs} /> : <MechanicalGraphic />}
        <TitleBar subtitle="BADGE HOLDER DETECTED">ZORG NFT</TitleBar>
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin" style={{ color: "#22d3ee" }} />
        </div>
      </BannerWrapper>
    );
  }

  // USER HAS MINTED - Show their NFT prominently
  if (!canMint || userHasNFT) {
    return (
      <BannerWrapper accentColor="cyan" large>
        <div className="flex items-start justify-between">
          <MetadataLabel level="LV.4" label="CLAIMED" />
          <StatusIndicator status="OWNED" color="cyan" />
        </div>

        {userNFT ? (
          <UserNFTDisplay nft={userNFT} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#22d3ee" }} />
          </div>
        )}

        <div className="space-y-1.5">
          <RetroProgress value={supply} total={MAX_SUPPLY} loading={isSupplyLoading} />
          <p className="text-center" style={{ fontFamily: "ui-monospace, monospace", fontSize: "9px", letterSpacing: "0.06em", color: "#22d3ee" }}>
            UNIT REGISTERED TO YOUR WALLET
          </p>
        </div>
      </BannerWrapper>
    );
  }

  const isLoading = isPending || isConfirming;

  return (
    <BannerWrapper accentColor="cyan">
      <div className="flex items-start justify-between">
        <MetadataLabel level="LV.3" label="REMOTE OPS" />
        <StatusIndicator status="AUTHORIZED" color="cyan" />
      </div>

      {displayedNFTs.length > 0 ? <NFTGallery nfts={displayedNFTs} /> : <MechanicalGraphic />}

      <TitleBar subtitle="BADGE HOLDER EXCLUSIVE">ZORG NFT</TitleBar>

      <div className="space-y-2 sm:space-y-2.5">
        <RetroProgress value={supply} total={MAX_SUPPLY} loading={isSupplyLoading} />
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            onClick={handleMint}
            disabled={isLoading || isSoldOut}
            className="h-7 flex-1 rounded-[2px] transition-all hover:shadow-[0_0_12px_rgba(34,211,238,0.3)] disabled:opacity-50 sm:h-8"
            style={{ fontFamily: "'Courier New', ui-monospace, monospace", fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "#22d3ee", background: "rgba(34, 211, 238, 0.08)", border: "1px solid rgba(34, 211, 238, 0.25)" }}
          >
            {isSoldOut ? "SOLD OUT" : isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>{isConfirming ? "CONFIRMING..." : "PROCESSING..."}</span>
              </span>
            ) : "INITIATE MINT"}
          </Button>
          {!isSoldOut && remaining <= 1000n && (
            <div className="flex items-center gap-1">
              <OrangeAccent />
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "7px", textTransform: "uppercase", color: "#f97316" }}>{remaining.toString()} LEFT</span>
            </div>
          )}
        </div>
      </div>
    </BannerWrapper>
  );
};
