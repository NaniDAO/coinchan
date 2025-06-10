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
        {/* Animated rotating diamond logo - exact 16-frame animation */}
        <svg
          width="400"
          height="400"
          viewBox="0 0 400 400"
          xmlns="http://www.w3.org/2000/svg"
          className="w-16 h-16"
        >
          {/* Frame 1: 0° - Front view */}
          <g opacity="1">
            <animate 
              attributeName="opacity" 
              values="1;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 155,160 200,135" fill="#FF6B9D" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,135 245,160" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="155,160 200,135 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,135 245,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="155,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 245,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="155" y1="160" x2="245" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 2: 22.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;1;0;0;0;0;0;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 160,160 200,132" fill="#FF6B9D" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,132 240,160" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,132 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,132 240,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 240,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="160" y1="160" x2="240" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 3: 45° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;1;0;0;0;0;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 170,160 200,130" fill="#FF6B9D" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,130 235,160" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,130 235,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="170,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 235,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="170" y1="160" x2="235" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 4: 67.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;1;0;0;0;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 180,160 200,135" fill="#FF6B9D" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,135 220,160" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,135 220,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="180,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 220,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="180" y1="160" x2="220" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 5: 90° - side view */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;1;0;0;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 195,160 200,140" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,140 205,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="195,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 205,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="195" y1="160" x2="205" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 6: 112.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;1;0;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 180,160 200,135" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,135 220,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="180,160 200,135 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="180,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 220,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="180" y1="160" x2="220" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 7: 135° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;1;0;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 165,160 200,130" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,130 230,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="165,160 200,130 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="165,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 230,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="165" y1="160" x2="230" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 8: 157.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;1;0;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 160,160 200,132" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,132 240,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,132 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,132 240,160 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 240,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="160" y1="160" x2="240" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 9: 180° - back view */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;1;0;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 155,160 200,135" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,135 245,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="155,160 200,135 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,135 245,160 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="155,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 245,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="155" y1="160" x2="245" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 10: 202.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;1;0;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 160,160 200,132" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,132 240,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,132 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,132 240,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 240,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="160" y1="160" x2="240" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 11: 225° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;0;1;0;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 170,160 200,130" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,130 235,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,130 235,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="170,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 235,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="170" y1="160" x2="235" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 12: 247.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;0;0;1;0;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 180,160 200,135" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,135 220,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,135 220,160 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="180,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 220,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="180" y1="160" x2="220" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 13: 270° - other side view */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;0;0;0;1;0;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 195,160 200,140" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,140 205,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="195,160 200,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 205,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="195" y1="160" x2="205" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 14: 292.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;0;0;0;0;1;0;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 180,160 200,135" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,135 220,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,135 220,160 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="180,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 220,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="180" y1="160" x2="220" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 15: 315° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;0;0;0;0;0;1;0" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 170,160 200,130" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,130 235,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,130 235,160 200,160" fill="#FFE066" stroke="#000000" strokeWidth="2"/>
            <polygon points="170,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 235,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="170" y1="160" x2="235" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>

          {/* Frame 16: 337.5° */}
          <g opacity="0">
            <animate 
              attributeName="opacity" 
              values="0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;1" 
              dur="3.2s" 
              repeatCount="indefinite"
            />
            <polygon points="200,80 160,160 200,132" fill="#00D4FF" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,80 200,132 240,160" fill="#FF6B9D" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,132 200,160" fill="#66D9A6" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,132 240,160 200,160" fill="#FF6B9D" stroke="#000000" strokeWidth="2"/>
            <polygon points="160,160 200,160 200,240" fill="#B967DB" stroke="#000000" strokeWidth="2"/>
            <polygon points="200,160 240,160 200,240" fill="#FF9F40" stroke="#000000" strokeWidth="2"/>
            <line x1="200" y1="80" x2="200" y2="240" stroke="#000000" strokeWidth="2"/>
            <line x1="160" y1="160" x2="240" y2="160" stroke="#000000" strokeWidth="2"/>
          </g>
        </svg>
      </div>
    );
  }
);

LoadingLogo.displayName = "LoadingLogo";

export { LoadingLogo, loadingLogoVariants };