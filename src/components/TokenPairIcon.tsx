import { memo } from "react";
import { cn } from "@/lib/utils";
import { EthereumIcon } from "./EthereumIcon";

interface TokenPairIconProps {
  token1Symbol?: string;
  token2Symbol?: string;
  token1Image?: string;
  token2Image?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const getInitials = (symbol: string) => {
  return symbol?.slice(0, 2).toUpperCase() ?? "";
};

// Color map for token initials
const getColorForSymbol = (symbol: string) => {
  const symbolKey = symbol?.toLowerCase() ?? "";
  const colorMap: Record<string, { bg: string; text: string }> = {
    eth: { bg: "bg-black", text: "text-white" },
    cult: { bg: "bg-red-600", text: "text-white" },
    ens: { bg: "bg-[#0080BC]", text: "text-white" },
    za: { bg: "bg-red-500", text: "text-white" },
    pe: { bg: "bg-green-700", text: "text-white" },
    ro: { bg: "bg-red-700", text: "text-white" },
  };

  const initials = symbolKey.slice(0, 2);
  return colorMap[initials] || { bg: "bg-gray-600", text: "text-white" };
};

export const TokenPairIcon = memo(
  ({ token1Symbol = "ETH", token2Symbol, token1Image, token2Image, size = "md", className }: TokenPairIconProps) => {
    const sizeClasses = {
      sm: "h-4 w-4 text-[8px]",
      md: "h-5 w-5 text-[10px]",
      lg: "h-6 w-6 text-xs",
    };

    const containerSizeClasses = {
      sm: "h-4",
      md: "h-5",
      lg: "h-6",
    };

    const renderTokenIcon = (symbol: string, image?: string) => {
      const isEth = symbol.toLowerCase() === "eth";
      const isCult = symbol.toLowerCase() === "cult";
      const { bg, text } = getColorForSymbol(symbol);

      if (isEth) {
        return <EthereumIcon className={sizeClasses[size]} />;
      }

      if (isCult && !image) {
        // Use local CULT image
        return (
          <img
            src="/cult.jpg"
            alt="CULT"
            className={cn(sizeClasses[size], "rounded-full object-cover")}
          />
        );
      }

      if (image) {
        return (
          <img
            src={image}
            alt={symbol}
            className={cn(sizeClasses[size], "rounded-full object-cover")}
          />
        );
      }

      // Fallback to initials
      return (
        <div
          className={cn(
            sizeClasses[size],
            bg,
            text,
            "rounded-full flex items-center justify-center font-bold"
          )}
        >
          {getInitials(symbol)}
        </div>
      );
    };

    if (!token2Symbol) {
      // Single token
      return (
        <div className={cn("flex items-center", containerSizeClasses[size], className)}>
          {renderTokenIcon(token1Symbol, token1Image)}
        </div>
      );
    }

    // Token pair with overlap
    return (
      <div className={cn("flex items-center -space-x-1.5", containerSizeClasses[size], className)}>
        <div className="relative z-10">
          {renderTokenIcon(token1Symbol, token1Image)}
        </div>
        <div className="relative">
          {renderTokenIcon(token2Symbol, token2Image)}
        </div>
      </div>
    );
  }
);

TokenPairIcon.displayName = "TokenPairIcon";