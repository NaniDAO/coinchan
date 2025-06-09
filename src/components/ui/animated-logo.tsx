import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const animatedLogoVariants = cva(
  "inline-block transition-opacity duration-100 ease-in-out relative",
  {
    variants: {
      size: {
        default: "w-20 h-24", // 80x96 equivalent
        sm: "w-16 h-[4.8rem]", // 64x76.8
        lg: "w-30 h-36", // 120x144
        xl: "w-50 h-60", // 200x240
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface AnimatedLogoProps 
  extends React.HTMLAttributes<HTMLDivElement>, 
         VariantProps<typeof animatedLogoVariants> {
  animated?: boolean;
}

const AnimatedLogo = React.forwardRef<HTMLDivElement, AnimatedLogoProps>(
  ({ className, size, animated = false, ...props }, ref) => {
    return (
      <div
        className={cn(animatedLogoVariants({ size }), "cursor-pointer", className)}
        ref={ref}
        {...props}
      >
        {/* Static Logo */}
        <svg
          viewBox="0 0 200 240"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            "w-full h-full transition-opacity duration-100 ease-in-out",
            animated ? "opacity-0" : "opacity-100"
          )}
        >
          {/* Top left facet */}
          <polygon
            points="100,20 55,120 100,85"
            fill="#FF6B9D"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Top right facet */}
          <polygon
            points="100,20 100,85 145,120"
            fill="#00D4FF"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Middle left facet */}
          <polygon
            points="55,120 100,85 100,120"
            fill="#FFE066"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Middle right facet */}
          <polygon
            points="100,85 145,120 100,120"
            fill="#66D9A6"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Bottom left facet */}
          <polygon
            points="55,120 100,120 100,200"
            fill="#FF9F40"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Bottom right facet */}
          <polygon
            points="100,120 145,120 100,200"
            fill="#B967DB"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Center vertical line */}
          <line
            x1="100"
            y1="20"
            x2="100"
            y2="200"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Top internal lines */}
          <line
            x1="100"
            y1="85"
            x2="55"
            y2="120"
            stroke="#000000"
            strokeWidth="2"
          />
          <line
            x1="100"
            y1="85"
            x2="145"
            y2="120"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Middle horizontal line */}
          <line
            x1="55"
            y1="120"
            x2="145"
            y2="120"
            stroke="#000000"
            strokeWidth="2"
          />
        </svg>

        {/* Animated Logo - same as static but with rotation animation */}
        <svg
          viewBox="0 0 200 240"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            "w-full h-full absolute top-0 left-0 transition-opacity duration-100 ease-in-out pointer-events-none",
            animated ? "opacity-100 animate-spin" : "opacity-0"
          )}
          style={{
            animationDuration: animated ? "3.2s" : undefined,
          }}
        >
          {/* Top left facet */}
          <polygon
            points="100,20 55,120 100,85"
            fill="#FF6B9D"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Top right facet */}
          <polygon
            points="100,20 100,85 145,120"
            fill="#00D4FF"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Middle left facet */}
          <polygon
            points="55,120 100,85 100,120"
            fill="#FFE066"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Middle right facet */}
          <polygon
            points="100,85 145,120 100,120"
            fill="#66D9A6"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Bottom left facet */}
          <polygon
            points="55,120 100,120 100,200"
            fill="#FF9F40"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Bottom right facet */}
          <polygon
            points="100,120 145,120 100,200"
            fill="#B967DB"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Center vertical line */}
          <line
            x1="100"
            y1="20"
            x2="100"
            y2="200"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Top internal lines */}
          <line
            x1="100"
            y1="85"
            x2="55"
            y2="120"
            stroke="#000000"
            strokeWidth="2"
          />
          <line
            x1="100"
            y1="85"
            x2="145"
            y2="120"
            stroke="#000000"
            strokeWidth="2"
          />
          {/* Middle horizontal line */}
          <line
            x1="55"
            y1="120"
            x2="145"
            y2="120"
            stroke="#000000"
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  }
);

AnimatedLogo.displayName = "AnimatedLogo";

export { AnimatedLogo, animatedLogoVariants };