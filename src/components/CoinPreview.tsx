import { cn } from "@/lib/utils";

export const CoinPreview = ({
  name,
  symbol,
  coinId,
  isLoading,
  className,
}: {
  name?: string;
  symbol?: string;
  coinId: bigint;
  isLoading: boolean;
  className?: string;
}) => {
  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <h2 className="text-lg sm:text-xl font-semibold transition-opacity duration-300">
        {isLoading ? (
          <span className="inline-flex items-center space-x-2">
            <span className="h-6 bg-muted/40 rounded w-40 skeleton"></span>
            <span className="h-6 bg-muted/40 rounded w-16 skeleton"></span>
          </span>
        ) : (
          <span className="content-transition loaded">
            {name} [{symbol}]
          </span>
        )}
      </h2>
      <p className="text-sm">ID: {coinId.toString()}</p>
    </div>
  );
};
