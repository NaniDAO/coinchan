import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const animatedLogoVariants = cva("svg-logo", {
  variants: {
    size: {
      default: "w-16 h-20", // 64x80 equivalent
      sm: "w-12 h-[3.6rem]", // 48x57.6
      lg: "w-24 h-28", // 96x112
      xl: "", // Landing page - no size restrictions, handled by CSS
    },
  },
  defaultVariants: {
    size: "default",
  },
});

export interface AnimatedLogoProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof animatedLogoVariants> {
  animated?: boolean;
}

const AnimatedLogo = React.forwardRef<HTMLDivElement, AnimatedLogoProps>(
  ({ className, size, animated = false, ...props }, ref) => {
    // For landing page, we use different class structure
    const isLanding = size === "xl";

    return (
      <div
        className={cn(
          isLanding ? "landing-logo" : animatedLogoVariants({ size }),
          className,
        )}
        ref={ref}
        {...props}
      >
        {/* Static Logo */}
        <svg
          width={isLanding ? "200" : undefined}
          height={isLanding ? "240" : undefined}
          viewBox="0 0 200 240"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            isLanding
              ? "static-logo"
              : "w-full h-full transition-opacity duration-100 ease-in-out",
            !isLanding && animated ? "opacity-0" : "",
            isLanding && animated ? "hidden" : "",
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

        {/* Animated Logo - exact 16-frame animation scaled to match static logo */}
        <svg
          width={isLanding ? "800" : "400"}
          height={isLanding ? "840" : "400"}
          viewBox="0 0 400 1000"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(
            isLanding
              ? "loading-diamond"
              : "absolute top-0 left-1/2 -translate-x-1/2 transition-opacity duration-100 ease-in-out pointer-events-none w-full h-full",
            !isLanding && animated ? "opacity-100" : "",
            !isLanding && !animated ? "opacity-0" : "",
            isLanding && animated ? "active" : "",
          )}
        >
          {/* Frame 1: 0° - Front view */}
          <g opacity="1">
            <animate
              attributeName="opacity"
              values="1;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 155,160 200,135"
              fill="#FF6B9D"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,135 245,160"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="155,160 200,135 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,135 245,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="155,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 245,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="155"
              y1="160"
              x2="245"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 2: 22.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;1;0;0;0;0;0;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 160,160 200,132"
              fill="#FF6B9D"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,132 240,160"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,132 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,132 240,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 240,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="160"
              y1="160"
              x2="240"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 3: 45° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;1;0;0;0;0;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 170,160 200,130"
              fill="#FF6B9D"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,130 235,160"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,130 235,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="170,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 235,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="170"
              y1="160"
              x2="235"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 4: 67.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;1;0;0;0;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 180,160 200,135"
              fill="#FF6B9D"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,135 220,160"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,135 220,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="180,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 220,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="180"
              y1="160"
              x2="220"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 5: 90° - side view */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;1;0;0;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 195,160 200,140"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,140 205,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="195,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 205,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="195"
              y1="160"
              x2="205"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 6: 112.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;1;0;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 180,160 200,135"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,135 220,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="180,160 200,135 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="180,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 220,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="180"
              y1="160"
              x2="220"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 7: 135° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;1;0;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 165,160 200,130"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,130 230,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="165,160 200,130 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="165,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 230,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="165"
              y1="160"
              x2="230"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 8: 157.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;1;0;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 160,160 200,132"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,132 240,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,132 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,132 240,160 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 240,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="160"
              y1="160"
              x2="240"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 9: 180° - back view */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;1;0;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 155,160 200,135"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,135 245,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="155,160 200,135 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,135 245,160 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="155,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 245,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="155"
              y1="160"
              x2="245"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 10: 202.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;1;0;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 160,160 200,132"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,132 240,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,132 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,132 240,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 240,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="160"
              y1="160"
              x2="240"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 11: 225° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;0;1;0;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 170,160 200,130"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,130 235,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,130 235,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="170,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 235,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="170"
              y1="160"
              x2="235"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 12: 247.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;0;0;1;0;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 180,160 200,135"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,135 220,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,135 220,160 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="180,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 220,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="180"
              y1="160"
              x2="220"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 13: 270° - other side view */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;0;0;0;1;0;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 195,160 200,140"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,140 205,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="195,160 200,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 205,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="195"
              y1="160"
              x2="205"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 14: 292.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;0;0;0;0;1;0;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 180,160 200,135"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,135 220,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,135 220,160 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="180,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 220,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="180"
              y1="160"
              x2="220"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 15: 315° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;0;0;0;0;0;1;0"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 170,160 200,130"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,130 235,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,130 235,160 200,160"
              fill="#FFE066"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="170,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 235,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="170"
              y1="160"
              x2="235"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>

          {/* Frame 16: 337.5° */}
          <g opacity="0">
            <animate
              attributeName="opacity"
              values="0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;1"
              dur="3.2s"
              repeatCount="indefinite"
            />
            <polygon
              points="200,80 160,160 200,132"
              fill="#00D4FF"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,80 200,132 240,160"
              fill="#FF6B9D"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,132 200,160"
              fill="#66D9A6"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,132 240,160 200,160"
              fill="#FF6B9D"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="160,160 200,160 200,240"
              fill="#B967DB"
              stroke="#000000"
              strokeWidth="2"
            />
            <polygon
              points="200,160 240,160 200,240"
              fill="#FF9F40"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="200"
              y1="80"
              x2="200"
              y2="240"
              stroke="#000000"
              strokeWidth="2"
            />
            <line
              x1="160"
              y1="160"
              x2="240"
              y2="160"
              stroke="#000000"
              strokeWidth="2"
            />
          </g>
        </svg>
      </div>
    );
  },
);

AnimatedLogo.displayName = "AnimatedLogo";

export { AnimatedLogo, animatedLogoVariants };
