import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatImageURL } from "@/hooks/metadata";

interface CoinImagePopupProps {
  imageUrl: string | null;
  coinName: string;
  coinSymbol?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CoinImagePopup({
  imageUrl,
  coinName,
  coinSymbol = "TOKEN",
  size = "md",
  className = "",
}: CoinImagePopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  const formattedImageUrl = imageUrl ? formatImageURL(imageUrl) : null;

  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-16 h-16 sm:w-20 sm:h-20",
    lg: "w-24 h-24",
  };

  return (
    <>
      <button
        onClick={() => formattedImageUrl && !imageError && setIsOpen(true)}
        className={cn(
          "relative overflow-hidden rounded-full transition-all duration-200",
          formattedImageUrl &&
            !imageError &&
            [
              "cursor-zoom-in",
              "hover:scale-105 hover:shadow-lg",
              "hover:ring-2 hover:ring-primary/50 dark:hover:ring-primary/30",
              "active:scale-95 touch-manipulation",
            ].join(" "),
          sizeClasses[size],
          className,
        )}
        disabled={!formattedImageUrl || imageError}
        aria-label={`View ${coinName} image`}
      >
        {formattedImageUrl && !imageError ? (
          <img
            src={formattedImageUrl}
            alt={`${coinName} logo`}
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-xs font-mono">
            {coinSymbol.slice(0, 3)}
          </div>
        )}
      </button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl sm:max-w-3xl md:max-w-4xl p-0 overflow-hidden">
          <div className="relative bg-background">
            <div className="flex items-center justify-center p-8 bg-muted/20">
              <img
                src={formattedImageUrl || ""}
                alt={`${coinName} logo`}
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
            <div className="p-4 border-t border-border">
              <h3 className="text-xl font-bold text-foreground">
                {coinName} {coinSymbol && `(${coinSymbol})`}
              </h3>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
