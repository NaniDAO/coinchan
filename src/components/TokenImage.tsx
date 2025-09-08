import { memo, useMemo } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { EthereumIcon } from "./EthereumIcon";
import { formatImageURL } from "@/hooks/metadata";

const getInitials = (symbol: string) => symbol?.slice(0, 2).toUpperCase() ?? "";

const getColorForSymbol = (symbol: string) => {
  const symbolKey = symbol?.toLowerCase() ?? "";
  const colorMap: Record<string, { bg: string; text: string }> = {
    eth: { bg: "bg-black", text: "text-white" },
    za: { bg: "bg-red-500", text: "text-white" },
    pe: { bg: "bg-green-700", text: "text-white" },
    ro: { bg: "bg-red-700", text: "text-white" },
    "..": { bg: "bg-gray-800", text: "text-white" },
  };

  const initials = symbolKey.slice(0, 2);
  return colorMap[initials] || { bg: "bg-yellow-500", text: "text-white" };
};

type TokenImageProps = {
  symbol: string;
  imageUrl?: string | null;
};

const specialLogos: Record<string, string> = {
  ENS: "/ens.svg",
  CULT: "/cult.jpg",
  WLFI: "/wlfi.png",
};

export const TokenImage = memo(({ symbol, imageUrl }: TokenImageProps) => {
  const { bg, text } = getColorForSymbol(symbol);
  const resolvedImageUrl = useMemo(() => {
    if (imageUrl) {
      return formatImageURL(imageUrl);
    }
    return null;
  }, [imageUrl]);

  // Ethereum has a custom SVG component
  if (symbol === "ETH") {
    return (
      <Avatar className="w-8 h-8">
        <EthereumIcon className="w-full h-full rounded-full" />
      </Avatar>
    );
  }

  // Special token logos from local assets
  if (specialLogos[symbol]) {
    return (
      <Avatar className="w-8 h-8">
        <AvatarImage src={specialLogos[symbol]} alt={`${symbol} logo`} />
        <AvatarFallback>{getInitials(symbol)}</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className="w-8 h-8">
      {resolvedImageUrl && <AvatarImage src={resolvedImageUrl} alt={`${symbol} logo`} loading="lazy" />}
      <AvatarFallback className={`${bg} ${text} text-xs font-medium`}>{getInitials(symbol)}</AvatarFallback>
    </Avatar>
  );
});
