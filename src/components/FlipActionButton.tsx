import { cn } from "@/lib/utils";
import { ArrowDownUpIcon } from "lucide-react";
import * as React from "react";

interface ActionButtonProps {
  onClick: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export const FlipActionButton: React.FC<ActionButtonProps> = ({ onClick, icon, className }) => {
  const [animating, setAnimating] = React.useState(false);
  const durationMs = 320; // tweak if you want

  const handleClick = () => {
    // trigger the spin once
    setAnimating(false); // reset in case it was left true
    // force reflow so class re-applies even on rapid clicks
    // (no-op read that ensures next setAnimating(true) re-triggers animation)
    void document.body.offsetHeight;
    setAnimating(true);
    onClick();
  };

  const handleAnimEnd = () => setAnimating(false);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 rounded-full outline-2 outline-accent-foreground",
        "bg-accent hover:scale-105 focus:scale-105 active:scale-95",
        "focus:outline-primary transition-all z-10 touch-manipulation",
        className,
      )}
    >
      {icon || (
        <ArrowDownUpIcon
          onAnimationEnd={handleAnimEnd}
          className={cn(
            "h-5 w-5 text-accent-foreground",
            // one-time spin on click; uses Tailwind's built-in `spin` keyframes, but only 1 iteration
            animating ? "motion-safe:animate-[spin_0.32s_linear_1]" : "",
          )}
          // ensure duration matches the class above (for reduced-motion users, animation won't run)
          style={{ animationDuration: `${durationMs}ms` }}
        />
      )}
    </button>
  );
};
