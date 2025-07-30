import type { CoinSource } from "@/lib/coins";
import { formatNumber } from "@/lib/utils";
import type { Address } from "viem";
import { CreatorDisplay } from "./CreatorDisplay";
import { CoinImagePopup } from "./CoinImagePopup";

interface CoinInfoCardProps {
  coinId: bigint;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  swapFee: bigint[];
  isOwner: boolean;
  type: CoinSource;
  marketCapEth: number;
  marketCapUsd: number;
  isEthPriceData: boolean;
  tokenURI: string;
  isLoading: boolean;
  isZCurveBonding?: boolean;
  zcurveFeeOrHook?: string;
  creator?: Address;
}

export const CoinInfoCard = ({
  coinId,
  name,
  symbol,
  description,
  imageUrl,
  swapFee,
  isOwner,
  type,
  marketCapEth,
  marketCapUsd,
  isEthPriceData,
  tokenURI,
  isLoading,
  isZCurveBonding = false,
  zcurveFeeOrHook,
  creator,
}: CoinInfoCardProps) => {
  // Since CoinImagePopup handles its own fallback logic, we just pass the URL
  const currentImageUrl = imageUrl || null;

  return (
    <div
      className={`flex items-start gap-4 mb-4 p-4 border-muted border-2 bg-muted/10 text-muted-foreground rounded-lg content-transition ${isLoading ? "loading" : "loaded fadeIn"}`}
    >
      <div className="flex-shrink-0">
        {isLoading ? (
          <div className="w-16 h-16 relative">
            <div className="w-full h-full flex bg-destructive text-background justify-center items-center rounded-full animate-pulse">
              TKN
            </div>
          </div>
        ) : (
          <CoinImagePopup imageUrl={currentImageUrl} coinName={name} coinSymbol={symbol} size="md" />
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
              <h3 className="text-lg font-medium truncate content-transition loaded">{name}</h3>
              <span className="text-sm font-medium text-accent dark:text-accent content-transition loaded">
                [{symbol}]
              </span>
            </>
          )}
        </div>

        {/* Token ID in hex format and Etherscan link */}
        <div className="flex items-center mt-1 text-xs">
          <span className="font-medium text-secondary dark:text-chart-2 mr-1">
            ID: {coinId.toString()} {type === "COOKBOOK" ? null : `(0x${coinId.toString(16)})`}
          </span>
          {type === "COOKBOOK" ? null : (
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
        <div className="mt-2 text-xs">
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
                        <span className="ml-1 text-xs text-muted-foreground cursor-help">ⓘ</span>
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
                          {(Number(s) / 100).toFixed(2)}%
                        </span>
                      ))
                    )}
                  </span>
                </>
              )}
              {!isLoading && isOwner && <span className="text-xs text-chart-2">(You are the owner)</span>}
            </div>

            {/* Market Cap section */}
            {isLoading ? (
              <div className="flex items-center gap-1">
                <span className="font-medium market-cap-text">Est. Market Cap:</span>
                <div className="h-3 bg-muted/40 rounded w-24 skeleton"></div>
              </div>
            ) : (
              (marketCapEth !== null || isZCurveBonding) && (
                <div className="flex items-center gap-1 transition-opacity duration-300">
                  <span className="font-medium market-cap-text">
                    {isZCurveBonding ? "Implied Market Cap:" : "Est. Market Cap:"}
                  </span>
                  <span className="market-cap-text">
                    {marketCapEth !== null && marketCapEth > 0 ? formatNumber(marketCapEth, 4) : "N/A"} ETH
                  </span>
                  {marketCapUsd !== null && marketCapUsd !== 0 ? (
                    <span className="ml-1 market-cap-text">(~${formatNumber(marketCapUsd, 0)})</span>
                  ) : isEthPriceData ? (
                    <span className="ml-1 market-cap-text">(USD price processing...)</span>
                  ) : (
                    <span className="ml-1 market-cap-text">(ETH price unavailable)</span>
                  )}
                </div>
              )
            )}
          </div>

          {/* Token URI link if available */}
          {!isLoading && tokenURI && tokenURI !== "N/A" && (
            <div className="mt-1">
              <a
                href={
                  tokenURI.startsWith("ipfs://") ? `https://content.wrappr.wtf/ipfs/${tokenURI.slice(7)}` : tokenURI
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                View Token Metadata
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
