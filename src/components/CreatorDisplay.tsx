import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, User } from "lucide-react";
import type { Address } from "viem";
import { useEnsName } from "wagmi";
import { mainnet } from "viem/chains";
import { cn } from "@/lib/utils";

interface CreatorDisplayProps {
  address: Address;
  className?: string;
  showLabel?: boolean;
  linkToEtherscan?: boolean;
  size?: "sm" | "md" | "lg";
}

export function CreatorDisplay({
  address,
  className = "",
  showLabel = true,
  linkToEtherscan = true,
  size = "md",
}: CreatorDisplayProps) {
  const { t } = useTranslation();

  // ENS resolution with error handling
  const { data: ensName, isError } = useEnsName({
    address,
    chainId: mainnet.id,
    enabled: !!address,
    staleTime: 300_000, // Cache for 5 minutes
    retry: false, // Don't retry on failure to prevent blocking
  });

  // Format address for display
  const displayName = useMemo(() => {
    if (!address) return "Unknown";
    if (ensName && !isError) return ensName;
    // Show first 6 and last 4 characters
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, [address, ensName, isError]);

  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  const iconSize = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  const content = (
    <div className={cn("flex items-center gap-1.5", sizeClasses[size], className)}>
      {showLabel && (
        <>
          <User className="text-muted-foreground" size={iconSize[size]} />
          <span className="text-muted-foreground">{t("creator.label", "Creator")}:</span>
        </>
      )}
      <span className={cn("font-mono", ensName ? "font-medium" : "")}>{displayName}</span>
      {linkToEtherscan && <ExternalLink className="text-muted-foreground" size={iconSize[size]} />}
    </div>
  );

  if (linkToEtherscan) {
    return (
      <a
        href={`https://etherscan.io/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1 transition-all duration-200",
          "hover:text-primary hover:underline hover:bg-muted/50 rounded px-1 -mx-1",
          "active:scale-95 touch-manipulation",
        )}
      >
        {content}
      </a>
    );
  }

  return content;
}
