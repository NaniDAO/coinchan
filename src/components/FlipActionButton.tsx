import { ArrowDownUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionButtonProps {
  onClick: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export const FlipActionButton: React.FC<ActionButtonProps> = ({ onClick, icon, className }) => {
  return (
    <button
      className={cn(
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-3 rounded-full shadow-xl",
        "bg-primary hover:bg-primary/80 focus:bg-primary/90 active:scale-95",
        "shadow-[0_0_15px_rgba(0,204,255,0.3)]",
        "focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all z-10 touch-manipulation",
        className,
      )}
      onClick={onClick}
    >
      {icon || <ArrowDownUpIcon className="h-5 w-5 text-background" />}
    </button>
  );
};
