import {
    useAccount,
    useReadContract,
    useWriteContract,
    useWaitForTransactionReceipt,
} from "wagmi";
import { ZORG_NFT, ZORG_NFT_ABI } from "@/constants/ZORGNFT";
import { ZORG_BADGES_ADDRESS, ZORG_BADGES_ABI } from "@/constants/ZORGBadges";
import { Button } from "@/components/ui/button";
import { Loader2, Download, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState, useCallback } from "react";
import { formatEther, keccak256, encodePacked } from "viem";
import { useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import { useAddressZorgNFT } from "@/hooks/useAddressZorgNFT";

const MAX_SUPPLY = 10000n;

// Client-side SVG generation (matches on-chain logic)
const bgColors1 = [
    "000000",
    "0a0a0a",
    "1a0a1a",
    "0a1a0a",
    "1a0f0a",
    "f0f0f0",
    "e8e8ff",
    "1a1a00",
];
const bgColors2 = [
    "000000",
    "111111",
    "0a0a1a",
    "0a0f0a",
    "0f0a0a",
    "e8e8e8",
    "fff8f0",
    "0f0f00",
];
const palettePrimary = [
    "e8e8e0",
    "a0f0a0",
    "ffffff",
    "808080",
    "ff6060",
    "00ffff",
    "ffffff",
    "ffc0cb",
];
const paletteSecondary = [
    "c0c0b0",
    "60a060",
    "f0f0ff",
    "404040",
    "a04040",
    "008080",
    "000000",
    "ff69b4",
];
const paletteAccent = [
    "ff0000",
    "ff00ff",
    "ffd700",
    "00ff00",
    "ffff00",
    "ff0080",
    "ff0000",
    "ffffff",
];

function getTraitIndex(
    tokenId: number,
    traitIndex: number,
    count: number,
): number {
    const packed = encodePacked(
        ["uint256", "uint256"],
        [BigInt(tokenId), BigInt(traitIndex)],
    );
    const hash = keccak256(packed);
    return Number(BigInt(hash) % BigInt(count));
}

function getColors(tokenId: number) {
    const bgIdx = getTraitIndex(tokenId, 0, 8);
    const palIdx = getTraitIndex(tokenId, 1, 8);
    return {
        bg1: bgColors1[bgIdx],
        bg2: bgColors2[bgIdx],
        primary: palettePrimary[palIdx],
        secondary: paletteSecondary[palIdx],
        accent: paletteAccent[palIdx],
        isLight: bgIdx === 5 || bgIdx === 6,
    };
}

function generateZorgSVG(tokenId: number): string {
    const c = getColors(tokenId);
    const eyeColor = c.isLight ? "000000" : c.bg1;
    const gid = `bg-${tokenId}`;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="512" height="512" shape-rendering="crispEdges" style="image-rendering:pixelated">`;
    svg += `<defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#${c.bg1}"/><stop offset="100%" stop-color="#${c.bg2}"/></linearGradient></defs>`;
    svg += `<rect width="64" height="64" fill="url(#${gid})"/>`;

    // Corruption effects
    const corr = getTraitIndex(tokenId, 5, 6);
    if (corr === 1)
        svg += `<rect x="10" y="52" width="4" height="8" fill="#${c.primary}"/><rect x="10" y="60" width="4" height="4" fill="#${c.primary}" opacity="0.5"/><rect x="24" y="52" width="6" height="10" fill="#${c.primary}"/><rect x="26" y="62" width="4" height="2" fill="#${c.primary}" opacity="0.3"/><rect x="46" y="52" width="4" height="12" fill="#${c.primary}"/>`;
    if (corr === 2)
        svg += `<rect x="30" y="0" width="4" height="64" fill="#${c.bg1}"/><rect x="32" y="16" width="2" height="40" fill="#${c.secondary}" opacity="0.5"/>`;
    if (corr === 3)
        svg += `<rect x="2" y="14" width="4" height="4" fill="#${c.primary}"/><rect x="58" y="22" width="4" height="4" fill="#${c.primary}"/><rect x="4" y="50" width="4" height="4" fill="#${c.secondary}"/><rect x="56" y="46" width="4" height="4" fill="#${c.secondary}"/>`;
    if (corr === 4)
        svg += `<rect x="0" y="0" width="64" height="64" fill="#${c.primary}" opacity="0.1"/><rect x="16" y="16" width="32" height="32" fill="#${c.bg1}" opacity="0.3"/>`;
    if (corr === 5)
        svg += `<rect x="4" y="20" width="6" height="4" fill="#${c.primary}" opacity="0.4"/><rect x="4" y="24" width="6" height="4" fill="#${c.primary}" opacity="0.4"/><rect x="4" y="28" width="6" height="4" fill="#${c.primary}" opacity="0.4"/><rect x="54" y="20" width="6" height="4" fill="#${c.primary}" opacity="0.4"/><rect x="54" y="24" width="6" height="4" fill="#${c.primary}" opacity="0.4"/><rect x="54" y="28" width="6" height="4" fill="#${c.primary}" opacity="0.4"/>`;

    // Aura effects
    const aura = getTraitIndex(tokenId, 4, 8);
    if (aura === 1)
        svg += `<rect x="20" y="2" width="24" height="4" fill="#${c.accent}" opacity="0.8"/><rect x="16" y="4" width="4" height="2" fill="#${c.accent}" opacity="0.5"/><rect x="44" y="4" width="4" height="2" fill="#${c.accent}" opacity="0.5"/><rect x="24" y="0" width="16" height="2" fill="#${c.accent}" opacity="0.6"/>`;
    if (aura === 2)
        svg += `<rect x="4" y="8" width="2" height="2" fill="#${c.primary}" opacity="0.4"/><rect x="58" y="16" width="2" height="2" fill="#${c.primary}" opacity="0.3"/><rect x="2" y="44" width="2" height="2" fill="#${c.primary}" opacity="0.5"/><rect x="56" y="52" width="2" height="2" fill="#${c.primary}" opacity="0.4"/><rect x="12" y="58" width="2" height="2" fill="#${c.primary}" opacity="0.3"/><rect x="50" y="6" width="2" height="2" fill="#${c.primary}" opacity="0.5"/>`;
    if (aura === 3)
        svg += `<rect x="2" y="2" width="8" height="2" fill="#${c.accent}" opacity="0.6"/><rect x="2" y="2" width="2" height="8" fill="#${c.accent}" opacity="0.6"/><rect x="54" y="2" width="8" height="2" fill="#${c.accent}" opacity="0.6"/><rect x="60" y="2" width="2" height="8" fill="#${c.accent}" opacity="0.6"/><rect x="2" y="54" width="8" height="2" fill="#${c.accent}" opacity="0.6"/><rect x="2" y="54" width="2" height="8" fill="#${c.accent}" opacity="0.6"/><rect x="54" y="60" width="8" height="2" fill="#${c.accent}" opacity="0.6"/><rect x="60" y="54" width="2" height="8" fill="#${c.accent}" opacity="0.6"/>`;
    if (aura === 4)
        svg += `<rect x="18" y="4" width="28" height="4" fill="#${c.accent}"/><rect x="20" y="0" width="4" height="4" fill="#${c.accent}"/><rect x="30" y="-2" width="4" height="6" fill="#${c.accent}"/><rect x="40" y="0" width="4" height="4" fill="#${c.accent}"/>`;
    if (aura === 5)
        svg += `<rect x="8" y="8" width="4" height="8" fill="#${c.accent}"/><rect x="4" y="4" width="4" height="8" fill="#${c.accent}"/><rect x="0" y="0" width="4" height="6" fill="#${c.accent}"/><rect x="52" y="8" width="4" height="8" fill="#${c.accent}"/><rect x="56" y="4" width="4" height="8" fill="#${c.accent}"/><rect x="60" y="0" width="4" height="6" fill="#${c.accent}"/>`;
    if (aura === 6)
        svg += `<rect x="0" y="20" width="64" height="2" fill="#${c.accent}" opacity="0.3"/><rect x="0" y="36" width="64" height="1" fill="#${c.primary}" opacity="0.4"/><rect x="4" y="24" width="20" height="2" fill="#${c.primary}" opacity="0.2"/><rect x="40" y="40" width="20" height="2" fill="#${c.primary}" opacity="0.2"/>`;
    if (aura === 7)
        svg += `<rect x="18" y="36" width="2" height="20" fill="#${c.accent}" opacity="0.7"/><rect x="18" y="56" width="2" height="6" fill="#${c.accent}" opacity="0.4"/><rect x="44" y="36" width="2" height="16" fill="#${c.accent}" opacity="0.7"/><rect x="44" y="52" width="2" height="8" fill="#${c.accent}" opacity="0.3"/>`;

    // Ears
    svg += `<rect x="16" y="8" width="4" height="4" fill="#${c.primary}"/><rect x="20" y="12" width="4" height="4" fill="#${c.primary}"/><rect x="40" y="12" width="4" height="4" fill="#${c.primary}"/><rect x="44" y="8" width="4" height="4" fill="#${c.primary}"/>`;
    // Head structure
    svg += `<rect x="16" y="16" width="32" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="12" y="20" width="8" height="4" fill="#${c.primary}"/><rect x="24" y="20" width="16" height="4" fill="#${c.primary}"/><rect x="44" y="20" width="8" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="8" y="24" width="48" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="8" y="28" width="48" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="8" y="32" width="48" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="12" y="36" width="40" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="16" y="40" width="32" height="4" fill="#${c.primary}"/>`;

    // Expression (eyes)
    const expr = getTraitIndex(tokenId, 2, 10);
    if (expr === 0)
        svg += `<rect x="14" y="28" width="10" height="6" fill="#${eyeColor}"/><rect x="40" y="28" width="10" height="6" fill="#${eyeColor}"/>`;
    if (expr === 1)
        svg += `<rect x="12" y="24" width="14" height="12" fill="#${eyeColor}"/><rect x="38" y="24" width="14" height="12" fill="#${eyeColor}"/><rect x="16" y="26" width="4" height="4" fill="#${c.primary}"/><rect x="44" y="26" width="4" height="4" fill="#${c.primary}"/><rect x="14" y="20" width="4" height="4" fill="#${eyeColor}"/><rect x="46" y="20" width="4" height="4" fill="#${eyeColor}"/>`;
    if (expr === 2)
        svg += `<rect x="10" y="22" width="18" height="16" fill="#${eyeColor}"/><rect x="36" y="22" width="18" height="16" fill="#${eyeColor}"/>`;
    if (expr === 3)
        svg += `<rect x="14" y="26" width="10" height="8" fill="#${eyeColor}"/><rect x="40" y="26" width="10" height="8" fill="#${eyeColor}"/><rect x="16" y="34" width="4" height="12" fill="#${c.accent}"/><rect x="16" y="46" width="4" height="6" fill="#${c.accent}" opacity="0.6"/><rect x="44" y="34" width="4" height="16" fill="#${c.accent}"/><rect x="44" y="50" width="4" height="4" fill="#${c.accent}" opacity="0.4"/>`;
    if (expr === 4)
        svg += `<rect x="14" y="28" width="10" height="6" fill="#${eyeColor}"/><rect x="40" y="28" width="10" height="6" fill="#${eyeColor}"/><rect x="28" y="10" width="8" height="8" fill="#${c.accent}"/><rect x="30" y="12" width="4" height="4" fill="#${eyeColor}"/>`;
    if (expr === 5)
        svg += `<rect x="14" y="26" width="4" height="4" fill="#${eyeColor}"/><rect x="18" y="30" width="4" height="4" fill="#${eyeColor}"/><rect x="22" y="26" width="4" height="4" fill="#${eyeColor}"/><rect x="18" y="22" width="4" height="4" fill="#${eyeColor}"/><rect x="40" y="26" width="4" height="4" fill="#${eyeColor}"/><rect x="44" y="30" width="4" height="4" fill="#${eyeColor}"/><rect x="48" y="26" width="4" height="4" fill="#${eyeColor}"/><rect x="44" y="22" width="4" height="4" fill="#${eyeColor}"/>`;
    if (expr === 6)
        svg += `<rect x="8" y="20" width="22" height="20" fill="#000"/><rect x="34" y="20" width="22" height="20" fill="#000"/>`;
    if (expr === 7)
        svg += `<rect x="14" y="26" width="10" height="8" fill="#fff"/><rect x="40" y="26" width="10" height="8" fill="#fff"/><rect x="16" y="28" width="6" height="4" fill="#${c.accent}"/><rect x="42" y="28" width="6" height="4" fill="#${c.accent}"/>`;
    if (expr === 8)
        svg += `<rect x="12" y="24" width="14" height="10" fill="#${c.accent}"/><rect x="38" y="24" width="14" height="10" fill="#${c.accent}"/><rect x="16" y="26" width="6" height="6" fill="#000"/><rect x="42" y="26" width="6" height="6" fill="#000"/><rect x="10" y="22" width="4" height="4" fill="#${c.accent}"/><rect x="50" y="22" width="4" height="4" fill="#${c.accent}"/>`;
    if (expr === 9)
        svg += `<rect x="8" y="20" width="20" height="16" fill="#fff" opacity="0.9"/><rect x="36" y="20" width="20" height="16" fill="#fff" opacity="0.9"/><rect x="12" y="24" width="12" height="8" fill="#${c.accent}"/><rect x="40" y="24" width="12" height="8" fill="#${c.accent}"/>`;

    // Mouth
    const mouth = getTraitIndex(tokenId, 3, 9);
    if (mouth === 1)
        svg += `<rect x="24" y="44" width="16" height="2" fill="#${eyeColor}"/>`;
    if (mouth === 2)
        svg += `<rect x="22" y="42" width="20" height="10" fill="#${eyeColor}"/><rect x="26" y="46" width="12" height="4" fill="#200000"/>`;
    if (mouth === 3)
        svg += `<rect x="22" y="42" width="20" height="8" fill="#${eyeColor}"/><rect x="24" y="42" width="2" height="4" fill="#${c.primary}"/><rect x="28" y="42" width="2" height="4" fill="#${c.primary}"/><rect x="32" y="42" width="2" height="4" fill="#${c.primary}"/><rect x="36" y="42" width="2" height="4" fill="#${c.primary}"/>`;
    if (mouth === 4)
        svg += `<rect x="26" y="44" width="12" height="4" fill="#${eyeColor}"/><rect x="30" y="48" width="4" height="8" fill="#${c.secondary}"/><rect x="30" y="56" width="4" height="4" fill="#${c.secondary}" opacity="0.5"/>`;
    if (mouth === 5)
        svg += `<rect x="22" y="44" width="20" height="2" fill="#${eyeColor}"/><rect x="24" y="42" width="2" height="6" fill="#${c.secondary}"/><rect x="28" y="42" width="2" height="6" fill="#${c.secondary}"/><rect x="32" y="42" width="2" height="6" fill="#${c.secondary}"/><rect x="36" y="42" width="2" height="6" fill="#${c.secondary}"/>`;
    if (mouth === 6)
        svg += `<rect x="22" y="44" width="20" height="4" fill="#${eyeColor}"/><rect x="20" y="42" width="4" height="4" fill="#${eyeColor}"/><rect x="40" y="42" width="4" height="4" fill="#${eyeColor}"/>`;
    if (mouth === 7)
        svg += `<rect x="20" y="42" width="24" height="6" fill="#${eyeColor}"/><rect x="18" y="44" width="4" height="4" fill="#${eyeColor}"/><rect x="42" y="44" width="4" height="4" fill="#${eyeColor}"/><rect x="24" y="42" width="3" height="3" fill="#${c.primary}"/><rect x="30" y="42" width="3" height="3" fill="#${c.primary}"/>`;
    if (mouth === 8)
        svg += `<rect x="26" y="44" width="12" height="4" fill="#${eyeColor}"/><rect x="30" y="46" width="8" height="10" fill="#ff6b6b"/><rect x="32" y="54" width="4" height="4" fill="#ff6b6b"/>`;

    // Cheeks and body
    svg += `<rect x="20" y="44" width="8" height="4" fill="#${c.primary}"/><rect x="36" y="44" width="8" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="12" y="48" width="8" height="4" fill="#${c.primary}"/><rect x="28" y="48" width="8" height="4" fill="#${c.primary}"/><rect x="44" y="48" width="8" height="4" fill="#${c.primary}"/>`;
    svg += `<rect x="8" y="52" width="8" height="4" fill="#${c.primary}"/><rect x="48" y="52" width="8" height="4" fill="#${c.primary}"/>`;

    // Symbol
    const sym = getTraitIndex(tokenId, 6, 6);
    if (sym === 1)
        svg += `<rect x="30" y="54" width="4" height="8" fill="#${c.accent}"/><rect x="26" y="58" width="12" height="2" fill="#${c.accent}"/>`;
    if (sym === 2)
        svg += `<rect x="30" y="54" width="4" height="2" fill="#${c.accent}"/><rect x="28" y="56" width="8" height="2" fill="#${c.accent}"/><rect x="30" y="58" width="4" height="2" fill="#${c.accent}"/>`;
    if (sym === 3)
        svg += `<rect x="26" y="56" width="12" height="6" fill="#${c.accent}"/><rect x="30" y="58" width="4" height="2" fill="#${c.bg1}"/>`;
    if (sym === 4)
        svg += `<rect x="28" y="56" width="8" height="2" fill="#${c.accent}"/><rect x="34" y="56" width="2" height="6" fill="#${c.accent}"/><rect x="28" y="60" width="6" height="2" fill="#${c.accent}"/><rect x="28" y="58" width="2" height="2" fill="#${c.accent}"/>`;
    if (sym === 5)
        svg += `<rect x="28" y="54" width="2" height="10" fill="#${c.accent}"/><rect x="34" y="54" width="2" height="10" fill="#${c.accent}"/><rect x="28" y="58" width="8" height="2" fill="#${c.accent}"/>`;

    svg += "</svg>";
    return svg;
}

function generateZorgDataUri(tokenId: number): string {
    const svg = generateZorgSVG(tokenId);
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type Seat = {
    holder: `0x${string}`;
    bal: bigint;
};

const parseTokenURI = (
    tokenURI: string,
): { image: string; name: string } | null => {
    try {
        const base64Data = tokenURI.replace(
            "data:application/json;base64,",
            "",
        );
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
        const img = new Image();
        img.crossOrigin = "anonymous";

        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = svgDataUri;
        });

        const scale = 4;
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size * scale;
        canvas.height = size * scale;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) =>
                    b ? resolve(b) : reject(new Error("Failed to create blob")),
                "image/png",
                1.0,
            );
        });

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
    const [mintedTokenId, setMintedTokenId] = useState<bigint | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // Use Alchemy API to fetch user's ZORG NFT
    const {
        nftImage: userNftImage,
        tokenId: userTokenId,
        hasNFT: userHasNFT,
    } = useAddressZorgNFT(address);

    // Generate a random token ID for preview immediately (client-side, no RPC needed)
    const [randomTokenId] = useState<number>(
        () => Math.floor(Math.random() * 5000) + 1,
    );

    // Generate preview image client-side (no contract call needed)
    const previewImage = useMemo(
        () => generateZorgDataUri(randomTokenId),
        [randomTokenId],
    );

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

    const { data: totalSupply, refetch: refetchSupply } = useReadContract({
        address: ZORG_NFT,
        abi: ZORG_NFT_ABI,
        functionName: "totalSupply",
        query: { staleTime: 5_000 },
    });

    const supply = totalSupply ?? 0n;

    // Fetch newly minted token URI
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

    // Build userNFT from Alchemy data or newly minted token
    const userNFT = useMemo(() => {
        // If we just minted, use the minted token data
        if (mintedTokenURI && mintedTokenId) {
            const parsed = parseTokenURI(mintedTokenURI as string);
            if (parsed) {
                return {
                    tokenId: Number(mintedTokenId),
                    image: parsed.image,
                    name: parsed.name,
                };
            }
        }
        // Otherwise use Alchemy data
        if (userHasNFT && userNftImage && userTokenId) {
            return {
                tokenId: Number(userTokenId),
                image: userNftImage,
                name: `ZORG #${userTokenId}`,
            };
        }
        return null;
    }, [userHasNFT, userNftImage, userTokenId, mintedTokenURI, mintedTokenId]);

    const {
        writeContract,
        data: txHash,
        isPending,
        reset,
    } = useWriteContract();

    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt(
        {
            hash: txHash,
        },
    );

    const refreshAllData = useCallback(() => {
        refetchSupply();
        refetchCanMint();
        queryClient.invalidateQueries({ queryKey: ["readContract"] });
        queryClient.invalidateQueries({ queryKey: ["zorg-nft"] });
    }, [refetchSupply, refetchCanMint, queryClient]);

    useEffect(() => {
        if (isSuccess && mintedTokenId) {
            toast.success("NFT minted successfully!");
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

    const hasBadge =
        badgeBalance !== undefined &&
        badgeBalance !== null &&
        (badgeBalance as bigint) > 0n;
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

    const handleDownload = async () => {
        if (!userNFT) return;
        setIsDownloading(true);
        try {
            await downloadNFTAsPNG(userNFT.image, userNFT.tokenId);
        } finally {
            setIsDownloading(false);
        }
    };

    const isLoadingData = address && (isBadgeLoading || isSeatsLoading);
    const isMinting = isPending || isConfirming;

    // Not connected - show public stats with preview
    if (!address) {
        return (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex gap-4">
                    {/* Preview NFT - generated client-side */}
                    <div className="flex-shrink-0">
                        <div
                            className="overflow-hidden rounded-lg border border-border opacity-70 bg-white"
                            style={{ width: "64px", height: "64px" }}
                        >
                            <img
                                src={previewImage}
                                alt="ZORG NFT Preview"
                                className="h-full w-full object-cover"
                                style={{ imageRendering: "pixelated" }}
                            />
                        </div>
                        <a
                            href="https://zorgz.eth.limo/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-[10px] text-muted-foreground hover:text-foreground mt-1"
                        >
                            See Gallery
                        </a>
                    </div>
                    {/* Stats */}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-2">ZORG NFT</div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Minted</span>
                                <span className="font-mono">
                                    {supply.toString()} /{" "}
                                    {MAX_SUPPLY.toString()}
                                </span>
                            </div>
                            <Progress
                                value={progressPercent}
                                className="h-1.5"
                            />
                            {minBalanceNeeded !== null && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                        Badge Floor
                                    </span>
                                    <span className="font-mono font-medium">
                                        {formatEther(minBalanceNeeded)} ZORG
                                    </span>
                                </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                                Connect wallet to check eligibility
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Loading state
    if (isLoadingData || isCanMintLoading) {
        return (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                        Loading NFT status...
                    </span>
                </div>
            </div>
        );
    }

    // User has NFT - show it
    if (userHasNFT) {
        if (!userNFT) {
            return (
                <div className="mb-4 p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                            Loading your NFT...
                        </span>
                    </div>
                </div>
            );
        }

        return (
            <div className="mb-4 p-4 border rounded-lg bg-card">
                <div className="flex items-center gap-4">
                    {/* NFT Image */}
                    <div className="relative flex-shrink-0">
                        <div
                            className="overflow-hidden rounded-lg border-2 border-primary/30"
                            style={{ width: "80px", height: "80px" }}
                        >
                            <img
                                src={userNFT.image}
                                alt={userNFT.name}
                                className="h-full w-full object-cover"
                                style={{ imageRendering: "pixelated" }}
                            />
                        </div>
                        <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground text-[10px] font-mono font-bold px-1.5 py-0.5 rounded">
                            #{userNFT.tokenId}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">Your ZORG NFT</div>
                        <div className="text-xs text-muted-foreground mt-1">
                            {supply.toString()} / {MAX_SUPPLY.toString()} minted
                        </div>
                        <div className="flex gap-2 mt-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="h-7 text-xs"
                            >
                                {isDownloading ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                    <Download className="h-3 w-3 mr-1" />
                                )}
                                PNG
                            </Button>
                            <a
                                href={`https://x.com/intent/tweet?text=${encodeURIComponent(`gm. just claimed ZORG NFT #${userNFT.tokenId}\n\nbadge holders can mint for free.`)}&url=${encodeURIComponent("https://zamm.finance/dao")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    Share
                                </Button>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // User doesn't have badge - show requirements with preview
    if (!hasBadge) {
        return (
            <div className="mb-4 p-4 border rounded-lg bg-muted/30">
                <div className="flex gap-4">
                    {/* Preview NFT - generated client-side */}
                    <div className="flex-shrink-0">
                        <div
                            className="overflow-hidden rounded-lg border border-border opacity-70 bg-white"
                            style={{ width: "64px", height: "64px" }}
                        >
                            <img
                                src={previewImage}
                                alt="ZORG NFT Preview"
                                className="h-full w-full object-cover"
                                style={{ imageRendering: "pixelated" }}
                            />
                        </div>
                        <a
                            href="https://zorgz.eth.limo/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-center text-[10px] text-muted-foreground hover:text-foreground mt-1"
                        >
                            See Gallery
                        </a>
                    </div>
                    {/* Stats */}
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium mb-1">ZORG NFT</div>
                        <div className="text-xs text-muted-foreground mb-2">
                            {isSoldOut
                                ? "All NFTs have been claimed."
                                : "Badge holders can mint free. Acquire shares to become eligible."}
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Minted</span>
                                <span className="font-mono">
                                    {supply.toString()} /{" "}
                                    {MAX_SUPPLY.toString()}
                                </span>
                            </div>
                            <Progress
                                value={progressPercent}
                                className="h-1.5"
                            />
                            {/* Badge Floor */}
                            {minBalanceNeeded !== null && !isSoldOut && (
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted-foreground">
                                        Badge Floor
                                    </span>
                                    <span className="font-mono font-medium">
                                        {formatEther(minBalanceNeeded)} ZORG
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // User can mint
    return (
        <div className="mb-4 p-4 border border-primary/30 rounded-lg bg-primary/5">
            <div className="text-sm font-medium mb-2">ZORG NFT</div>
            <div className="text-xs text-muted-foreground mb-3">
                You're eligible to mint a free ZORG NFT as a badge holder.
            </div>
            <div className="space-y-3">
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Minted</span>
                        <span className="font-mono">
                            {supply.toString()} / {MAX_SUPPLY.toString()}
                        </span>
                    </div>
                    <Progress value={progressPercent} className="h-1.5" />
                </div>
                <Button
                    onClick={handleMint}
                    disabled={isMinting || isSoldOut}
                    className="w-full"
                    size="sm"
                >
                    {isSoldOut ? (
                        "Sold Out"
                    ) : isMinting ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            {isConfirming ? "Confirming..." : "Minting..."}
                        </>
                    ) : (
                        "Mint NFT"
                    )}
                </Button>
            </div>
        </div>
    );
};
