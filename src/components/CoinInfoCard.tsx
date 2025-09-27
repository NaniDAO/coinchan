import { cn, formatNumber } from "@/lib/utils";
import type { Address } from "viem";
import { CreatorDisplay } from "./CreatorDisplay";
import { CoinImagePopup } from "./CoinImagePopup";
import { bpsToPct } from "@/lib/pools";
import { formatTokenURL } from "@/hooks/metadata";
import { isCookbookCoin } from "@/lib/coin-utils";
import { useQuery } from "@tanstack/react-query";
import { TokenUriMetadata, buildProjectLinksFromMetadata } from "@/lib/links";

interface CoinInfoCardProps {
  coinId: bigint;
  name?: string;
  symbol?: string;
  description: string;
  imageUrl?: string;
  swapFee: bigint[];
  isOwner: boolean;
  marketCapEth: number;
  marketCapUsd: number;
  isEthPriceData: boolean;
  tokenURI?: string;
  isLoading: boolean;
  isZCurveBonding?: boolean;
  zcurveFeeOrHook?: string;
  creator?: Address;
  className?: string;
}

export const CoinInfoCard = ({
  coinId,
  name,
  symbol,
  description,
  imageUrl,
  swapFee,
  isOwner,
  marketCapEth,
  marketCapUsd,
  isEthPriceData,
  tokenURI,
  isLoading,
  isZCurveBonding = false,
  zcurveFeeOrHook,
  creator,
  className,
}: CoinInfoCardProps) => {
  const { data: tokenMetadata } = useQuery<TokenUriMetadata | null>({
    queryKey: ["tokenMetadata", tokenURI?.toString()],
    queryFn: async () => {
      if (!tokenURI) return null;
      const response = await fetch(formatTokenURL(tokenURI));
      const data = (await response.json()) as TokenUriMetadata;
      return data;
    },
    enabled: !!tokenURI,
  });

  // Since CoinImagePopup handles its own fallback logic, we just pass the URL
  const currentImageUrl = imageUrl || null;
  const tokenType = isCookbookCoin(coinId) ? "COOKBOOK" : "ZAMM";

  // ---- Project links from metadata.attributes ----
  const projectLinks = buildProjectLinksFromMetadata(tokenMetadata);

  return (
    <div
      className={cn(
        `flex items-start gap-4 mb-4 p-4 border-muted border-2 bg-muted/10 text-muted-foreground rounded-lg content-transition`,
        isLoading ? "loading" : "loaded fadeIn",
        className,
      )}
    >
      <div className="flex-shrink-0">
        {isLoading ? (
          <div className="w-16 h-16 relative">
            <div className="w-full h-full flex bg-destructive text-background justify-center items-center rounded-full animate-pulse">
              TKN
            </div>
          </div>
        ) : (
          <CoinImagePopup
            imageUrl={currentImageUrl}
            coinName={name}
            coinSymbol={symbol}
            size="md"
          />
        )}
      </div>

      <div className="flex flex-col flex-grow overflow-hidden">
        <div className="flex items-baseline space-x-2">
          {isLoading ? (
            <>
              <div className="h-6 bg-muted/50 rounded w-32 skeleton"></div>
              <div className="h-4 bg-muted/50 rounded w-14 skeleton"></div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-medium truncate content-transition loaded">
                {name}
              </h3>
              <span className="text-sm font-medium text-secondary-foreground  content-transition loaded">
                [{symbol}]
              </span>
            </>
          )}
        </div>

        {/* Token ID in hex format and Etherscan link */}
        <div className="flex items-center mt-1 text-xs">
          <span className="font-medium text-secondary-foreground mr-1">
            ID: {coinId.toString()}{" "}
            {tokenType === "COOKBOOK" ? null : `(0x${coinId.toString(16)})`}
          </span>
          {tokenType === "COOKBOOK" ? null : (
            <a
              href={`https://etherscan.io/token/0x${coinId.toString(16)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-2"
            >
              View on Etherscan
            </a>
          )}
        </div>

        {/* Description */}
        {isLoading ? (
          <div className="mt-1 space-y-1">
            <div className="h-3 bg-muted/30 rounded w-full skeleton"></div>
            <div className="h-3 bg-muted/30 rounded w-3/4 skeleton"></div>
            <div className="h-3 bg-muted/30 rounded w-5/6 skeleton"></div>
          </div>
        ) : (
          <p className="text-sm font-medium description-text mt-1 overflow-y-auto max-h-20 content-transition loaded">
            {description || "No description available"}
          </p>
        )}

        {/* Creator */}
        {creator && (
          <div className="mt-2">
            <CreatorDisplay address={creator} size="sm" className="text-xs" />
          </div>
        )}

        {/* Market Cap Estimation and Swap Fee */}
        <div className="mt-3 text-xs">
          <div className="flex flex-col gap-1">
            {/* Always show the swap fee, independent of market cap calculation */}
            <div className="flex items-center gap-1">
              <span className="font-medium dark:text-chart-2">Swap Fee:</span>
              {isLoading ? (
                <div className="h-3 bg-muted/40 rounded w-10 skeleton"></div>
              ) : (
                <>
                  <span className="font-medium text-primary transition-opacity duration-300">
                    {isZCurveBonding ? (
                      <span className="group relative inline-flex items-center">
                        0%
                        <span className="ml-1 text-xs text-muted-foreground cursor-help">
                          ⓘ
                        </span>
                        <span className="absolute left-0 bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs p-2 rounded shadow-lg whitespace-nowrap z-10">
                          {zcurveFeeOrHook && BigInt(zcurveFeeOrHook) < 10000n
                            ? `${(Number(zcurveFeeOrHook) / 100).toFixed(2)}% swap fee will begin once graduated to zAMM`
                            : "0.3% swap fee will begin once graduated to zAMM"}
                        </span>
                      </span>
                    ) : (
                      swapFee.map((s, i) => (
                        <span key={i}>
                          {i > 0 && " | "}
                          {bpsToPct(s?.toString())}
                        </span>
                      ))
                    )}
                  </span>
                </>
              )}
              {!isLoading && isOwner && (
                <span className="text-xs text-chart-2">
                  (You are the owner)
                </span>
              )}
            </div>

            {/* Market Cap section */}
            {isLoading ? (
              <div className="flex items-center gap-1">
                <span className="font-medium market-cap-text">
                  Est. Market Cap:
                </span>
                <div className="h-3 bg-muted/40 rounded w-24 skeleton"></div>
              </div>
            ) : (
              (marketCapEth !== null || isZCurveBonding) && (
                <div className="flex items-center gap-1 transition-opacity duration-300">
                  <span className="font-medium market-cap-text">
                    {isZCurveBonding
                      ? "Implied Market Cap:"
                      : "Est. Market Cap:"}
                  </span>
                  <span className="market-cap-text">
                    {marketCapEth !== null && marketCapEth > 0
                      ? marketCapEth < 0.0001
                        ? `<0.0001 ETH`
                        : `${formatNumber(marketCapEth, 4)} ETH`
                      : "N/A"}
                  </span>
                  {marketCapUsd !== null && marketCapUsd !== 0 ? (
                    <span className="ml-1 market-cap-text">
                      {marketCapUsd < 1
                        ? `(~$${marketCapUsd.toFixed(2)})`
                        : `(~$${formatNumber(marketCapUsd, 0)})`}
                    </span>
                  ) : isEthPriceData ? (
                    <span className="ml-1 market-cap-text">
                      (USD price processing...)
                    </span>
                  ) : (
                    <span className="ml-1 market-cap-text">
                      (ETH price unavailable)
                    </span>
                  )}
                </div>
              )
            )}
          </div>

          {/* Token URI link if available */}
          {!isLoading && tokenURI && tokenURI !== "N/A" && (
            <div className="mt-1">
              <a
                href={formatTokenURL(tokenURI)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                View Token Metadata
              </a>
            </div>
          )}
        </div>

        {/* --- Project Links with logos --- */}
        {!isLoading && projectLinks.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {projectLinks.map((l) => (
                <a
                  key={l.key}
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-md border",
                    "bg-background/70 hover:bg-background transition-colors",
                    "text-xs font-medium",
                  )}
                  title={l.title}
                >
                  <l.icon className="h-3.5 w-3.5 opacity-80" />
                  <span className="truncate max-w-[12rem]">{l.label}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
