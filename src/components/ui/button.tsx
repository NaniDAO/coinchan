import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none border-2 border-border font-mono shadow-[4px_4px_0_var(--border)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
  {
    variants: {
      variant: {
        default:
          "bg-background !text-foreground hover:bg-foreground hover:!text-background dark:!text-foreground dark:hover:!text-background",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive dark:text-destructive-foreground dark:hover:bg-destructive/90",
        outline:
          "border-2 border-border bg-background !text-foreground hover:bg-foreground hover:!text-background dark:!text-foreground dark:hover:!text-background",
        secondary:
          "bg-muted text-muted-foreground hover:bg-foreground hover:text-background dark:text-muted-foreground dark:hover:text-background",
        ghost:
          "border-transparent bg-transparent text-foreground hover:bg-foreground hover:text-background hover:border-border dark:text-foreground dark:hover:text-background",
        link: "border-transparent bg-transparent text-foreground underline-offset-4 hover:underline dark:text-foreground",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 py-1",
        lg: "h-12 px-6 py-3",
        icon: "size-9 p-2",
      },
    },
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
      <Comp ref={ref} data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);

Button.displayName = "Button";
