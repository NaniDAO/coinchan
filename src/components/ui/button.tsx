import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-bold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none border-2 border-terminal-black font-mono retro-shadow active:retro-button-active",
  {
    variants: {
      variant: {
        default: "bg-terminal-white text-terminal-black hover:bg-terminal-black hover:text-terminal-white",
        destructive: "bg-terminal-white text-terminal-black hover:bg-terminal-black hover:text-terminal-white",
        outline: "border-2 border-terminal-black bg-terminal-white text-terminal-black hover:bg-terminal-black hover:text-terminal-white",
        secondary: "bg-terminal-gray text-terminal-black hover:bg-terminal-black hover:text-terminal-white",
        ghost: "border-transparent bg-transparent text-terminal-black hover:bg-terminal-black hover:text-terminal-white hover:border-terminal-black",
        link: "border-transparent bg-transparent text-terminal-black underline-offset-4 hover:underline",
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
