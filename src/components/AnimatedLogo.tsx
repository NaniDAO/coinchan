import { cn } from "@/lib/utils";
import { useState } from "react";
import { useTheme } from "@/lib/theme";

interface AnimatedLogoProps {
  className?: string;
  onClick?: () => void;
}

export const AnimatedLogo = ({ className, onClick }: AnimatedLogoProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const { theme } = useTheme();

  const handleClick = () => {
    setIsAnimating(true);
    onClick?.();
    // Reset animation after 2 seconds
    setTimeout(() => setIsAnimating(false), 2000);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "relative overflow-hidden rounded-lg transition-all duration-300 group",
        "hover:shadow-lg hover:scale-110 hover:bg-accent/10",
        "active:scale-95",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
        className
      )}
      aria-label="ZAMM Logo"
    >
      {isAnimating ? (
        <video
          src={theme === "dark" ? "/zammzamm-bw.mp4" : "/zammzamm.mp4"}
          className="h-10 w-10"
          autoPlay
          muted
          onEnded={() => setIsAnimating(false)}
        />
      ) : (
        <img 
          src="/zammzamm.png" 
          alt="ZAMM LOGO" 
          className={cn(
            "h-10 w-10 transition-transform duration-300",
            "group-hover:rotate-12"
          )}
        />
      )}
      
      {/* Hover effect overlay */}
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/0 to-primary/20 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      
      {/* Mobile touch feedback */}
      <div className="absolute inset-0 rounded-lg pointer-events-none">
        <div className="absolute inset-0 bg-primary/10 scale-0 transition-transform duration-300 group-active:scale-100" />
      </div>
    </button>
  );
};