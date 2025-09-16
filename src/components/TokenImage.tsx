import { memo, useMemo } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { EthereumIcon } from "./EthereumIcon";
import { formatImageURL } from "@/hooks/metadata";
import { getColorForSymbol, getInitials, specialLogos } from "@/lib/images";
import { cn } from "@/lib/utils";

type TokenImageProps = {
  symbol: string;
  imageUrl?: string | null;
  className?: string;
};

export const TokenImage = memo(({ symbol, imageUrl, className }: TokenImageProps) => {
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
      <Avatar className={cn("w-8 h-8", className)}>
        <EthereumIcon className="w-full h-full rounded-full" />
      </Avatar>
    );
  }

  // Special token logos from local assets
  if (specialLogos[symbol]) {
    return (
      <Avatar className={cn("w-8 h-8", className)}>
        <AvatarImage src={specialLogos[symbol]} alt={`${symbol} logo`} />
        <AvatarFallback>{getInitials(symbol)}</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar className={cn("w-8 h-8", className)}>
      {resolvedImageUrl && <AvatarImage src={resolvedImageUrl} alt={`${symbol} logo`} loading="lazy" />}
      <AvatarFallback className={`${bg} ${text} text-xs font-medium`}>{getInitials(symbol)}</AvatarFallback>
    </Avatar>
  );
});
