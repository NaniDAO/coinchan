import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils"; // assuming cn utility is in this location

interface SpinnerLoaderProps {
  className?: string;
}

const SpinnerLoader = ({ className }: SpinnerLoaderProps) => {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className={cn("h-5 w-5 animate-spin", className)} />
    </div>
  );
};

export default SpinnerLoader;
