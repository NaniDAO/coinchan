import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const loadingLogoVariants = cva(
  "flex items-center justify-center",
  {
    variants: {
      size: {
        default: "p-4",
        sm: "p-2", 
        lg: "p-6",
        xl: "p-8",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface LoadingLogoProps 
  extends React.HTMLAttributes<HTMLDivElement>, 
         VariantProps<typeof loadingLogoVariants> {}

const LoadingLogo = React.forwardRef<HTMLDivElement, LoadingLogoProps>(
  ({ className, size, ...props }, ref) => {
    return (
      <div
        className={cn(loadingLogoVariants({ size }), className)}
        ref={ref}
        role="status"
        aria-label="loading"
        {...props}
      >
        {/* Animated rotating diamond logo */}
        <svg
          viewBox="0 0 200 240"
          xmlns="http://www.w3.org/2000/svg"
          className="w-16 h-[4.8rem] animate-spin"
          style={{ animationDuration: "3.2s" }}
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

LoadingLogo.displayName = "LoadingLogo";

export { LoadingLogo, loadingLogoVariants };