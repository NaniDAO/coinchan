import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  [
    // layout
    "relative grid w-full items-start",
    "has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr]",
    "has-[>svg]:gap-x-3 gap-y-1",
    // terminal frame
    "rounded-md border-2",
    "border-[color:var(--terminal-black)] dark:border-[color:var(--border)]",
    "bg-[color:var(--terminal-white)] dark:bg-card",
    "text-foreground",
    // offset shadow + hover nudge
    "shadow-[4px_4px_0_var(--border)]",
    "transition-all",
    "hover:-translate-x-[2px] hover:-translate-y-[2px]",
    "hover:shadow-[6px_6px_0_var(--border)]",
    // icon sizing
    "[&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
    // left accent bar
    "before:absolute before:left-0 before:top-0 before:h-full before:w-1.5 before:content-['']",
  ].join(" "),
  {
    variants: {
      tone: {
        default: "",
        info: "",
        success: "",
        warning: "",
        destructive: "",
      },
      emphasis: {
        soft: "", // tinted bg, readable fg
        solid: "", // strong bg, white-ish fg
        outline: "", // no fill, just frame
      },
      size: {
        sm: "px-3 py-2 text-xs",
        md: "px-4 py-3 text-sm",
        lg: "px-5 py-4 text-base",
      },
      center: {
        true: "justify-items-center text-center [&>svg]:col-span-2 [&_[data-slot=alert-title]]:col-start-auto [&_[data-slot=alert-description]]:col-start-auto",
        false: "",
      },
    },
    compoundVariants: [
      // SOFT (tinted)
      {
        emphasis: "soft",
        tone: "default",
        class: "bg-accent text-accent-foreground before:bg-[color:var(--accent)]/80",
      },
      {
        emphasis: "soft",
        tone: "info",
        class: "bg-[color:var(--accent)] text-foreground before:bg-[color:var(--ring)]/60",
      },
      {
        emphasis: "soft",
        tone: "success",
        class: "bg-[color:var(--secondary)] text-foreground before:bg-[color:var(--primary)]/70",
      },
      {
        emphasis: "soft",
        tone: "warning",
        class: "bg-[color:var(--muted)] text-foreground before:bg-[color:var(--terminal-dark-gray)]",
      },
      {
        emphasis: "soft",
        tone: "destructive",
        class:
          "bg-card text-foreground before:bg-[color:var(--destructive)]/80 *:data-[slot=alert-description]:text-destructive/90",
      },

      // SOLID
      {
        emphasis: "solid",
        tone: "default",
        class:
          "bg-[color:var(--terminal-black)] text-[color:var(--terminal-white)] before:bg-[color:var(--terminal-black)]",
      },
      {
        emphasis: "solid",
        tone: "info",
        class: "bg-[color:var(--ring)] text-card before:bg-[color:var(--ring)]",
      },
      {
        emphasis: "solid",
        tone: "success",
        class: "bg-[color:var(--primary)] text-[color:var(--primary-foreground)] before:bg-[color:var(--primary)]",
      },
      {
        emphasis: "solid",
        tone: "warning",
        class: "bg-[color:var(--accent)] text-accent-foreground before:bg-[color:var(--accent)]",
      },
      {
        emphasis: "solid",
        tone: "destructive",
        class: "bg-[color:var(--destructive)] text-white before:bg-[color:var(--destructive)]",
      },

      // OUTLINE
      {
        emphasis: "outline",
        tone: "default",
        class: "bg-[color:var(--terminal-white)] dark:bg-card before:bg-[color:var(--accent)]/70",
      },
      {
        emphasis: "outline",
        tone: "destructive",
        class: "text-destructive before:bg-[color:var(--destructive)]/80",
      },
    ],
    defaultVariants: {
      tone: "default",
      emphasis: "soft",
      size: "md",
      center: false,
    },
  },
);

type AlertProps = React.ComponentProps<"div"> & VariantProps<typeof alertVariants>;

function Alert({ className, tone, emphasis, size, center, ...props }: AlertProps) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ tone, emphasis, size, center }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 min-h-4 line-clamp-1 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription };
