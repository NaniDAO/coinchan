import { Slot } from "@radix-ui/react-slot";
import { type VariantProps, cva } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  [
    // layout
    "inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap",
    // visual baseline
    "rounded-xl border-2 font-mono font-semibold",
    "shadow-[4px_4px_0_var(--border)]",
    // transitions & interaction
    "transition-colors duration-200 ease-out",
    "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
    // focus visibility
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // disabled
    "disabled:pointer-events-none disabled:opacity-60",
    // icons
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        // solid primary button with better defaults
        default:
          "bg-primary text-primary-foreground border-primary hover:bg-primary/90",

        // destructive preserves theme tokens and motion
        destructive:
          "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90",

        // outline now uses accent on hover for clearer affordance
        outline:
          "bg-background text-foreground border-border hover:bg-accent hover:text-accent-foreground",

        // secondary uses secondary tokens (instead of muted) for stronger contrast
        secondary:
          "bg-secondary text-secondary-foreground border-secondary hover:bg-secondary/90",

        // ghost is subtle but still gets a nice hover surface
        ghost:
          "bg-transparent text-foreground border-transparent hover:bg-accent hover:text-accent-foreground",

        // link acts like a real link: no border/shadow/offset movement
        link: "bg-transparent border-0 text-primary underline-offset-4 hover:underline shadow-none active:translate-x-0 active:translate-y-0",
      },
      size: {
        default: "h-9 px-4 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        icon: "size-9 p-0",
      },
    },
    compoundVariants: [
      // keep link minimal in all sizes
      { variant: "link", size: "sm", class: "text-sm" },
      { variant: "link", size: "default", class: "text-sm" },
      { variant: "link", size: "lg", class: "text-base" },
      // icon buttons still get a visible border for the brutalist pop
      { size: "icon", variant: "ghost", class: "border-border" },
      { size: "icon", variant: "outline", class: "px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
