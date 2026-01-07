export const InstantTradeActionSkeleton = () => {
  return (
    <div className="max-w-xl mx-auto lg:mx-0 animate-pulse">
      {/* Search Input Skeleton */}
      <div className="mb-6 relative group">
        <div className="w-full bg-muted border-2 border-border rounded-full h-12" />
      </div>

      {/* Main Trade Card Skeleton */}
      <div className="bg-background dark:bg-card border-2 border-border rounded-2xl p-1 shadow-sm">
        <div className="relative">
          {/* Sell Section */}
          <div className="bg-muted/50 rounded-xl p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <div className="h-4 bg-muted-foreground/20 rounded w-12" />
              <div className="h-8 bg-muted-foreground/20 rounded-full w-24" />
            </div>
            <div className="h-10 bg-muted-foreground/10 rounded w-full" />
            <div className="h-3 bg-muted-foreground/10 rounded w-32 mt-2" />
          </div>

          {/* Swap Button */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <div className="bg-background dark:bg-card border-2 border-border p-2 rounded-full w-12 h-12" />
          </div>

          {/* Buy Section */}
          <div className="bg-muted/50 rounded-xl p-4 sm:p-6 mt-1">
            <div className="flex justify-between items-center mb-4">
              <div className="h-4 bg-muted-foreground/20 rounded w-12" />
              <div className="h-8 bg-muted-foreground/20 rounded-full w-24" />
            </div>
            <div className="h-10 bg-muted-foreground/10 rounded w-full" />
            <div className="h-3 bg-muted-foreground/10 rounded w-32 mt-2" />
          </div>
        </div>

        {/* Action Button */}
        <div className="w-full mt-2 h-14 bg-primary/30 rounded-xl" />
      </div>
    </div>
  );
};
