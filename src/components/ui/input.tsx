import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-2 border-terminal-black bg-terminal-white text-terminal-black placeholder:text-terminal-black/60 selection:bg-terminal-black selection:text-terminal-white flex h-9 w-full min-w-0 px-3 py-1 text-base font-mono transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:ring-1 focus:ring-terminal-black focus:ring-offset-1",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
