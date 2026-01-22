/**
 * VHS-UI Component System
 * Retro-futuristic VHS-degraded archival-tech aesthetic
 * 90s broadcast recording of a technical documentary
 */

import { type ReactNode, forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// NOISE LAYER
// ============================================================================
export const NoiseLayer = ({ opacity = 0.04 }: { opacity?: number }) => (
  <div
    className="pointer-events-none absolute inset-0"
    aria-hidden="true"
    style={{
      opacity,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      animation: "vhsNoiseDrift 18s linear infinite",
    }}
  />
);

// ============================================================================
// GRID OVERLAY (Blueprint)
// ============================================================================
export const GridOverlay = ({
  majorSize = 60,
  minorSize = 15,
  opacity = 0.06,
}: {
  majorSize?: number;
  minorSize?: number;
  opacity?: number;
}) => (
  <div
    className="pointer-events-none absolute inset-0"
    aria-hidden="true"
    style={{
      opacity,
      backgroundImage: `
        repeating-linear-gradient(0deg, transparent, transparent ${majorSize - 1}px, rgba(26, 74, 74, 0.8) ${majorSize - 1}px, rgba(26, 74, 74, 0.8) ${majorSize}px),
        repeating-linear-gradient(90deg, transparent, transparent ${majorSize - 1}px, rgba(26, 74, 74, 0.8) ${majorSize - 1}px, rgba(26, 74, 74, 0.8) ${majorSize}px),
        repeating-linear-gradient(0deg, transparent, transparent ${minorSize - 1}px, rgba(15, 51, 51, 0.5) ${minorSize - 1}px, rgba(15, 51, 51, 0.5) ${minorSize}px),
        repeating-linear-gradient(90deg, transparent, transparent ${minorSize - 1}px, rgba(15, 51, 51, 0.5) ${minorSize - 1}px, rgba(15, 51, 51, 0.5) ${minorSize}px)
      `,
      backgroundSize: `${majorSize}px ${majorSize}px, ${majorSize}px ${majorSize}px, ${minorSize}px ${minorSize}px, ${minorSize}px ${minorSize}px`,
    }}
  />
);

// ============================================================================
// SCANLINE OVERLAY
// ============================================================================
export const ScanlineOverlay = ({ opacity = 0.02 }: { opacity?: number }) => (
  <div
    className="pointer-events-none absolute inset-0"
    aria-hidden="true"
    style={{
      opacity,
      backgroundImage: `repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(255,255,255,0.04) 2px, rgba(255,255,255,0.04) 4px)`,
    }}
  />
);

// ============================================================================
// CORNER MARKS (Registration/Crop Marks)
// ============================================================================
export const CornerMarks = ({
  size = 20,
  offset = 12,
  color = "rgba(100, 100, 100, 0.5)",
}: {
  size?: number;
  offset?: number;
  color?: string;
}) => (
  <div className="pointer-events-none absolute inset-0" aria-hidden="true">
    {/* Top left */}
    <div className="absolute" style={{ left: offset, top: offset }}>
      <div className="absolute left-0 top-0 h-[1px]" style={{ width: size, background: color }} />
      <div className="absolute left-0 top-0 w-[1px]" style={{ height: size, background: color }} />
    </div>
    {/* Top right */}
    <div className="absolute" style={{ right: offset, top: offset }}>
      <div className="absolute right-0 top-0 h-[1px]" style={{ width: size, background: color }} />
      <div className="absolute right-0 top-0 w-[1px]" style={{ height: size, background: color }} />
    </div>
    {/* Bottom left */}
    <div className="absolute" style={{ left: offset, bottom: offset }}>
      <div className="absolute bottom-0 left-0 h-[1px]" style={{ width: size, background: color }} />
      <div className="absolute bottom-0 left-0 w-[1px]" style={{ height: size, background: color }} />
    </div>
    {/* Bottom right */}
    <div className="absolute" style={{ right: offset, bottom: offset }}>
      <div className="absolute bottom-0 right-0 h-[1px]" style={{ width: size, background: color }} />
      <div className="absolute bottom-0 right-0 w-[1px]" style={{ height: size, background: color }} />
    </div>
  </div>
);

// ============================================================================
// VIGNETTE
// ============================================================================
export const Vignette = ({ intensity = 0.4 }: { intensity?: number }) => (
  <div
    className="pointer-events-none absolute inset-0"
    aria-hidden="true"
    style={{
      background: `radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, ${intensity}) 100%)`,
    }}
  />
);

// ============================================================================
// CHROMATIC ABERRATION
// ============================================================================
export const ChromaticAberration = ({ offset = 2, opacity = 0.03 }: { offset?: number; opacity?: number }) => (
  <>
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        background: `rgba(255, 80, 80, ${opacity})`,
        transform: `translateX(${offset}px)`,
        filter: "blur(0.5px)",
      }}
    />
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        background: `rgba(80, 80, 255, ${opacity})`,
        transform: `translateX(-${offset}px)`,
        filter: "blur(0.5px)",
      }}
    />
  </>
);

// ============================================================================
// LABEL BAR (Hero Label)
// ============================================================================
interface LabelBarProps {
  level: string;
  label: string;
  statusText?: string;
  statusColor?: "cyan" | "orange" | "green" | "neutral";
  showPulse?: boolean;
}

export const LabelBar = ({
  level,
  label,
  statusText,
  statusColor = "cyan",
  showPulse = false,
}: LabelBarProps) => {
  const statusColors = {
    cyan: { dot: "#22d3ee", text: "#22d3ee", shadow: "0 0 6px #22d3ee" },
    orange: { dot: "#f97316", text: "#f97316", shadow: "0 0 6px #f97316" },
    green: { dot: "#22c55e", text: "#22c55e", shadow: "0 0 6px #22c55e" },
    neutral: { dot: "#6b7280", text: "#71717a", shadow: "0 0 4px #6b7280" },
  };

  const colors = statusColors[statusColor];

  return (
    <div
      className="relative overflow-hidden border border-cyan-600/25 px-4 py-2.5 sm:px-5 sm:py-3"
      style={{
        background: `linear-gradient(180deg, rgba(34, 211, 238, 0.08) 0%, rgba(34, 211, 238, 0.03) 50%, rgba(34, 211, 238, 0.06) 100%)`,
        borderRadius: "2px",
      }}
    >
      {/* Inner scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,80,80,0.5) 1px, rgba(0,80,80,0.5) 2px)`,
        }}
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: "'Courier New', ui-monospace, monospace",
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "#a1a1aa",
            }}
          >
            {level}
          </span>
          <span className="h-[1px] w-2" style={{ background: "rgba(100,100,100,0.5)" }} />
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "9px",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#71717a",
            }}
          >
            {label}
          </span>
        </div>

        {statusText && (
          <div className="flex items-center gap-1.5">
            <span
              className={showPulse ? "animate-pulse" : ""}
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: colors.dot,
                boxShadow: colors.shadow,
              }}
            />
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "8px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: colors.text,
              }}
            >
              {statusText}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// ACTION PANEL
// ============================================================================
interface ActionPanelProps {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}

export const ActionPanel = forwardRef<HTMLDivElement, ActionPanelProps & HTMLAttributes<HTMLDivElement>>(
  ({ title, description, children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden border border-neutral-700/50 p-4 sm:p-6",
        className
      )}
      style={{
        background: "linear-gradient(180deg, rgba(15,15,15,0.95) 0%, rgba(8,8,8,0.98) 100%)",
        borderRadius: "3px",
      }}
      {...props}
    >
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 29px, #2a5555 29px, #2a5555 30px),
            repeating-linear-gradient(90deg, transparent, transparent 29px, #2a5555 29px, #2a5555 30px)
          `,
          backgroundSize: "30px 30px",
        }}
      />

      <div className="relative z-10">
        <h3
          style={{
            fontFamily: "'Courier New', ui-monospace, monospace",
            fontSize: "clamp(18px, 4vw, 24px)",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            textShadow: "0 0 16px rgba(34, 211, 238, 0.3)",
            color: "#f5f5f5",
            marginBottom: "4px",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: "11px",
            letterSpacing: "0.06em",
            color: "rgba(148, 163, 184, 0.7)",
            marginBottom: "16px",
          }}
        >
          {"// "}{description}
        </p>

        {children}
      </div>
    </div>
  )
);

ActionPanel.displayName = "ActionPanel";

// ============================================================================
// SYSTEM PANEL (Status/Info Panel)
// ============================================================================
interface SystemPanelProps {
  title: string;
  level?: string;
  children: ReactNode;
  className?: string;
}

export const SystemPanel = ({ title, level = "SYS.1", children, className }: SystemPanelProps) => (
  <div
    className={cn(
      "relative overflow-hidden border border-neutral-800/50 p-3 sm:p-4",
      className
    )}
    style={{
      background: "linear-gradient(180deg, rgba(12,12,12,0.92) 0%, rgba(6,6,6,0.96) 100%)",
      borderRadius: "2px",
    }}
  >
    <div className="flex items-center gap-2 mb-3">
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: "8px",
          letterSpacing: "0.06em",
          color: "rgba(113, 113, 122, 0.7)",
          textTransform: "uppercase",
        }}
      >
        {level}
      </span>
      <span className="h-[1px] flex-1" style={{ background: "rgba(60,60,60,0.4)" }} />
      <span
        style={{
          fontFamily: "'Courier New', ui-monospace, monospace",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          color: "#d4d4d8",
          textTransform: "uppercase",
        }}
      >
        {title}
      </span>
    </div>

    {children}
  </div>
);

// ============================================================================
// STATUS PILLS
// ============================================================================
interface StatusPill {
  label: string;
  value: string | ReactNode;
  color?: "cyan" | "orange" | "green" | "neutral";
}

export const StatusPills = ({ pills }: { pills: StatusPill[] }) => (
  <div className="flex flex-wrap gap-2">
    {pills.map((pill, i) => {
      const colorMap = {
        cyan: "rgba(34, 211, 238, 0.15)",
        orange: "rgba(249, 115, 22, 0.15)",
        green: "rgba(34, 197, 94, 0.15)",
        neutral: "rgba(113, 113, 122, 0.15)",
      };
      const borderMap = {
        cyan: "rgba(34, 211, 238, 0.3)",
        orange: "rgba(249, 115, 22, 0.3)",
        green: "rgba(34, 197, 94, 0.3)",
        neutral: "rgba(113, 113, 122, 0.3)",
      };
      const textMap = {
        cyan: "#22d3ee",
        orange: "#f97316",
        green: "#22c55e",
        neutral: "#a1a1aa",
      };

      const color = pill.color ?? "neutral";

      return (
        <div
          key={i}
          className="flex items-center gap-1.5 px-2.5 py-1.5"
          style={{
            background: colorMap[color],
            border: `1px solid ${borderMap[color]}`,
            borderRadius: "2px",
          }}
        >
          <span
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: "8px",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "rgba(161, 161, 170, 0.8)",
            }}
          >
            {pill.label}
          </span>
          <span
            style={{
              fontFamily: "'Courier New', ui-monospace, monospace",
              fontSize: "10px",
              fontWeight: 600,
              color: textMap[color],
            }}
          >
            {pill.value}
          </span>
        </div>
      );
    })}
  </div>
);

// ============================================================================
// STEPS LIST (System Instructions)
// ============================================================================
interface Step {
  number: string;
  title: string;
  description?: string;
  status?: "complete" | "active" | "pending";
}

export const StepsList = ({ steps }: { steps: Step[] }) => (
  <div className="space-y-2">
    {steps.map((step, i) => {
      const statusColors = {
        complete: { bg: "rgba(34, 197, 94, 0.1)", border: "rgba(34, 197, 94, 0.3)", text: "#22c55e" },
        active: { bg: "rgba(34, 211, 238, 0.1)", border: "rgba(34, 211, 238, 0.3)", text: "#22d3ee" },
        pending: { bg: "rgba(113, 113, 122, 0.08)", border: "rgba(113, 113, 122, 0.2)", text: "#71717a" },
      };

      const status = step.status ?? "pending";
      const colors = statusColors[status];

      return (
        <div
          key={i}
          className="flex items-start gap-3 p-2.5 sm:p-3"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            borderRadius: "2px",
          }}
        >
          <span
            className="shrink-0 flex items-center justify-center w-6 h-6"
            style={{
              fontFamily: "'Courier New', ui-monospace, monospace",
              fontSize: "11px",
              fontWeight: 700,
              color: colors.text,
              background: "rgba(0,0,0,0.3)",
              borderRadius: "2px",
            }}
          >
            {step.number}
          </span>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontFamily: "'Courier New', ui-monospace, monospace",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "#e5e5e5",
                textTransform: "uppercase",
              }}
            >
              {step.title}
            </div>
            {step.description && (
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "10px",
                  color: "rgba(148, 163, 184, 0.7)",
                  marginTop: "2px",
                }}
              >
                {step.description}
              </div>
            )}
          </div>
        </div>
      );
    })}
  </div>
);

// ============================================================================
// VHS CTA BUTTON
// ============================================================================
interface VHSButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
}

export const VHSButton = forwardRef<HTMLButtonElement, VHSButtonProps>(
  ({ variant = "primary", size = "md", loading, children, className, disabled, ...props }, ref) => {
    const baseStyles = `
      relative overflow-hidden font-mono font-semibold uppercase tracking-wider
      transition-all duration-150 ease-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black
      disabled:pointer-events-none disabled:opacity-50
      active:scale-[0.98]
    `;

    const variantStyles = {
      primary: `
        bg-gradient-to-b from-cyan-500/20 to-cyan-600/10
        border border-cyan-500/40
        text-cyan-400
        hover:from-cyan-500/30 hover:to-cyan-600/20 hover:border-cyan-400/60
        hover:shadow-[0_0_20px_rgba(34,211,238,0.25)]
      `,
      secondary: `
        bg-gradient-to-b from-neutral-700/30 to-neutral-800/20
        border border-neutral-600/40
        text-neutral-300
        hover:from-neutral-600/40 hover:to-neutral-700/30 hover:border-neutral-500/50
      `,
      ghost: `
        bg-transparent
        border border-neutral-700/30
        text-neutral-400
        hover:bg-neutral-800/30 hover:border-neutral-600/40 hover:text-neutral-300
      `,
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-[10px]",
      md: "h-10 px-4 text-xs",
      lg: "h-12 px-6 text-sm",
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          "rounded-[3px]",
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {/* Scanline effect on button */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.1) 1px, rgba(255,255,255,0.1) 2px)`,
          }}
        />
        <span className="relative z-10 flex items-center justify-center gap-2">
          {loading && (
            <span className="animate-spin h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full" />
          )}
          {children}
        </span>
      </button>
    );
  }
);

VHSButton.displayName = "VHSButton";

// ============================================================================
// TIMECODE DISPLAY
// ============================================================================
export const Timecode = ({ prefix = "REC", className }: { prefix?: string; className?: string }) => {
  const date = new Date();
  const code = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: "7px",
        letterSpacing: "0.04em",
        color: "rgba(100, 100, 100, 0.6)",
      }}
    >
      <span
        className="inline-block h-1 w-1 rounded-full animate-pulse"
        style={{ background: "#ef4444", boxShadow: "0 0 4px #ef4444" }}
      />
      <span>{prefix} {code}</span>
    </div>
  );
};

// ============================================================================
// SYSTEM VERSION DISPLAY
// ============================================================================
export const SystemVersion = ({ version = "SYS.2.4.1", className }: { version?: string; className?: string }) => (
  <div
    className={cn("flex items-center gap-2", className)}
    style={{
      fontFamily: "ui-monospace, monospace",
      fontSize: "7px",
      letterSpacing: "0.03em",
      color: "rgba(100, 100, 100, 0.5)",
    }}
  >
    <span>{version}</span>
    <span style={{ color: "rgba(80, 80, 80, 0.5)" }}>|</span>
    <span>{new Date().toISOString().split("T")[0]}</span>
  </div>
);

// ============================================================================
// VHS FRAME CONTAINER
// ============================================================================
interface VHSFrameProps {
  children: ReactNode;
  className?: string;
  letterbox?: boolean;
}

export const VHSFrame = ({ children, className, letterbox = true }: VHSFrameProps) => (
  <div
    className={cn(
      "relative overflow-hidden",
      letterbox && "border-y-[12px] sm:border-y-[16px] border-black",
      className
    )}
    style={{
      background: "linear-gradient(180deg, #0a0a0a 0%, #050505 100%)",
    }}
  >
    <NoiseLayer opacity={0.035} />
    <GridOverlay />
    <ScanlineOverlay />
    <Vignette intensity={0.35} />
    <CornerMarks />

    <div className="relative z-10">{children}</div>

    {/* Bottom annotations */}
    <div className="absolute bottom-2 left-3 z-20">
      <Timecode />
    </div>
    <div className="absolute bottom-2 right-3 z-20">
      <SystemVersion />
    </div>

    {/* Global VHS animations */}
    <style>{`
      @keyframes vhsNoiseDrift {
        0% { transform: translate(0, 0); }
        25% { transform: translate(-2%, -1%); }
        50% { transform: translate(-3%, -2%); }
        75% { transform: translate(-1%, -1%); }
        100% { transform: translate(0, 0); }
      }

      @media (prefers-reduced-motion: reduce) {
        .animate-pulse {
          animation: none;
        }
        @keyframes vhsNoiseDrift {
          0%, 100% { transform: translate(0, 0); }
        }
      }
    `}</style>
  </div>
);
