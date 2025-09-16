import { memo, useState, useMemo } from "react";
import { formatImageURL } from "@/hooks/metadata";
import { cn } from "@/lib/utils";
import { EthereumIcon } from "./EthereumIcon";
import { getColorForSymbol, getInitials, specialLogos } from "@/lib/images";

type HalfResolved = { kind: "component" } | { kind: "img"; src: string } | { kind: "fallback" };

const resolveVisual = (symbol?: string, imageUrl?: string | null): HalfResolved => {
  if (symbol === "ETH") return { kind: "component" };
  if (symbol && specialLogos[symbol]) return { kind: "img", src: specialLogos[symbol] };
  if (imageUrl) return { kind: "img", src: formatImageURL(imageUrl) };
  return { kind: "fallback" };
};

interface PoolTokenImageProps {
  imageUrl0: string | null;
  imageUrl1: string | null;
  symbol0?: string;
  symbol1?: string;
  className?: string;
}

export const PoolTokenImage = memo(({ imageUrl0, imageUrl1, symbol0, symbol1, className }: PoolTokenImageProps) => {
  const [error0, setError0] = useState(false);
  const [error1, setError1] = useState(false);

  const left = useMemo(() => resolveVisual(symbol0, imageUrl0), [symbol0, imageUrl0]);
  const right = useMemo(() => resolveVisual(symbol1, imageUrl1), [symbol1, imageUrl1]);

  const LeftHalf = () => {
    if (!error0) {
      if (left.kind === "component") {
        return (
          <div className="w-1/2 h-full border-r-2 border-muted flex items-center justify-center">
            <EthereumIcon className="w-4/5 h-4/5" />
          </div>
        );
      }
      if (left.kind === "img") {
        return (
          <img
            src={left.src}
            alt={symbol0 ? `${symbol0} logo` : "Token 0"}
            className="w-1/2 h-full object-cover border-r-2 border-muted"
            onError={() => setError0(true)}
            loading="lazy"
          />
        );
      }
    }
    const { bg, text } = getColorForSymbol(symbol0);
    return (
      <div
        className={cn("w-1/2 h-full flex items-center justify-center border-r-2 border-muted text-[10px]", bg, text)}
      >
        {getInitials(symbol0) || "T0"}
      </div>
    );
  };

  const RightHalf = () => {
    if (!error1) {
      if (right.kind === "component") {
        return (
          <div className="w-1/2 h-full flex items-center justify-center">
            <EthereumIcon className="w-4/5 h-4/5" />
          </div>
        );
      }
      if (right.kind === "img") {
        return (
          <img
            src={right.src}
            alt={symbol1 ? `${symbol1} logo` : "Token 1"}
            className="w-1/2 h-full object-cover"
            onError={() => setError1(true)}
            loading="lazy"
          />
        );
      }
    }
    const { bg, text } = getColorForSymbol(symbol1);
    return (
      <div className={cn("w-1/2 h-full flex items-center justify-center text-[10px]", bg, text)}>
        {getInitials(symbol1) || "T1"}
      </div>
    );
  };

  return (
    <div className={cn("relative w-8 h-8 rounded-full overflow-hidden flex border border-border", className)}>
      <LeftHalf />
      <RightHalf />
    </div>
  );
});
