export const CoinPreview = ({
  name,
  symbol,
  coinId,
  isLoading,
}: {
  name?: string;
  symbol?: string;
  coinId: bigint;
  isLoading: boolean;
}) => {
  return (
    <div className="flex flex-col items-start gap-2">
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
      {/* Metadata like tokenId */}
      <p className="text-sm">ID: {coinId.toString()}</p>
    </div>
  );
};
