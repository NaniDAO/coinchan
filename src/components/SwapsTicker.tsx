import React from 'react';
import { useRecentSwaps } from '../hooks/use-recent-swaps';

interface SwapsTickerProps {
  className?: string;
}

export const SwapsTicker: React.FC<SwapsTickerProps> = ({ className = "" }) => {
  const { data: recentSwaps = [] } = useRecentSwaps();

  return (
    <div className={`ticker ${className}`} role="marquee" aria-label="Recent swaps ticker">
      <div className="ticker__track" aria-hidden="true">
        {recentSwaps.length > 0 ? (
          <>
            {recentSwaps.map((swap) => (
              <span key={`first-${swap.id}`} className="ticker__item">
                {swap.timestamp} • {swap.coinSymbol} • {swap.amountIn} → {swap.amountOut}
              </span>
            ))}
            {/* Repeat for seamless loop */}
            {recentSwaps.map((swap) => (
              <span key={`second-${swap.id}`} className="ticker__item">
                {swap.timestamp} • {swap.coinSymbol} • {swap.amountIn} → {swap.amountOut}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="ticker__item">Loading recent swaps...</span>
            <span className="ticker__item">Loading recent swaps...</span>
          </>
        )}
      </div>
    </div>
  );
};

export default SwapsTicker;