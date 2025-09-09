import { memo, useMemo } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { EthereumIcon } from "./EthereumIcon";
import { formatImageURL } from "@/hooks/metadata";
import { getColorForSymbol, getInitials, specialLogos } from "@/lib/images";

type TokenImageProps = {
  symbol: string;
  imageUrl?: string | null;
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
      {resolvedImageUrl && (
        <AvatarImage
          src={resolvedImageUrl}
          alt={`${symbol} logo`}
          loading="lazy"
        />
      )}
      <AvatarFallback className={`${bg} ${text} text-xs font-medium`}>
        {getInitials(symbol)}
      </AvatarFallback>
    </Avatar>
  );
});
