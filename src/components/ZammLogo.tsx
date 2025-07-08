import type React from "react";
import { useEffect, useState } from "react";
import { AnimatedLogo } from "./ui/animated-logo";

interface ZammLogoProps {
  size?: "small" | "medium" | "large" | "landing";
  isLoading?: boolean;
  onClick?: () => void;
  className?: string;
  autoStartAnimation?: boolean;
}

export const ZammLogo: React.FC<ZammLogoProps> = ({
  size = "medium",
  isLoading = false,
  onClick,
  className = "",
  autoStartAnimation = false,
}) => {
  const [isLoadingState, setIsLoadingState] = useState(isLoading);

  // Auto-start animation for landing page
  useEffect(() => {
    if (autoStartAnimation && size === "landing") {
      // Delay slightly to match Redesign.html behavior
      const timer = setTimeout(() => {
        setIsLoadingState(true);
        setTimeout(() => setIsLoadingState(false), 3200); // 3.2s animation duration
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [autoStartAnimation, size]);

  const handleClick = () => {
    if (onClick) {
      if (size === "landing") {
        // For landing page, trigger loading animation
        setIsLoadingState(true);
        setTimeout(() => setIsLoadingState(false), 3200); // 3.2s animation
      }
      onClick();
    }
  };

  // Map sizes to AnimatedLogo size variants
  const sizeMap = {
    small: "sm" as const,
    medium: "default" as const,
    large: "lg" as const,
    landing: "xl" as const,
  };

  return <AnimatedLogo size={sizeMap[size]} animated={isLoadingState} onClick={handleClick} className={className} />;
};

export default ZammLogo;
