import React from 'react';
import { useTopPools } from '../hooks/use-top-pools';

interface PoolsTickerProps {
  className?: string;
}

export const PoolsTicker: React.FC<PoolsTickerProps> = ({ className = "" }) => {
  const { data: topPools = [] } = useTopPools();

  return (
    <div className={`ticker ${className}`} role="marquee" aria-label="Live top 20 coins ticker">
      <div className="ticker__track" aria-hidden="true">
        {topPools.length > 0 ? (
          <>
            {topPools.map((pool) => (
              <span key={`first-${pool.poolId}`} className="ticker__item">
                {pool.coinSymbol} {pool.ethAmount}
              </span>
            ))}
            {/* Repeat for seamless loop */}
            {topPools.map((pool) => (
              <span key={`second-${pool.poolId}`} className="ticker__item">
                {pool.coinSymbol} {pool.ethAmount}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="ticker__item">Loading top 20 coins...</span>
            <span className="ticker__item">Loading top 20 coins...</span>
          </>
        )}
      </div>
    </div>
  );
};

export default PoolsTicker;