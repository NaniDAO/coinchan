import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-md border-2 border-border bg-background text-foreground " +
          "placeholder:text-muted-foreground font-mono text-base md:text-sm " +
          "outline-none transition-[color,box-shadow] shadow-xs " +
          "selection:bg-primary selection:text-primary-foreground " +
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 " +
          // focus visuals
          "focus:ring-1 focus:ring-ring focus:ring-offset-1 focus-visible:border-ring focus-visible:ring-ring/50 " +
          // invalid state
          "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        "min-h-16 px-3 py-2 leading-relaxed align-top resize-y field-sizing-content",

        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
