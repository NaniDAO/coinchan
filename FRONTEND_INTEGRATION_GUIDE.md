# Frontend Integration Guide: AI-Powered Swap Recommendations

## Overview

This guide shows how to integrate the AI-powered swap recommendations API into the frontend `/trade` page. Recommendations are fetched from the backend and cached for 24 hours to minimize API calls and improve UX.

## API Endpoint

**Base URL**: `https://tx-recs-worker-production.up.railway.app`

**Endpoint**: `POST /v1/recommendations`

**Request**:
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"
}
```

**Response**:
```json
{
  "address": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  "hits": 45,
  "activity_preview": "SWAP_EXACT_IN: 1000.5 USDC → WETH via UNI_V3\n...",
  "market_preview": "Fear & Greed Index: 72 (Greed)\nTrending: ETH, BTC, ...",
  "recommendations": [
    {
      "tokenIn": {
        "address": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
        "id": null,
        "chainId": 1,
        "decimals": 6,
        "name": "USD Coin",
        "symbol": "USDC",
        "imageUrl": "https://...",
        "standard": "ERC20"
      },
      "tokenOut": {
        "address": "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "id": null,
        "chainId": 1,
        "decimals": 18,
        "name": "Wrapped Ether",
        "symbol": "WETH",
        "imageUrl": "https://...",
        "standard": "ERC20"
      },
      "amount": "1000",
      "side": "SWAP_EXACT_IN",
      "why": "Consolidate dust USDC holdings for better fee efficiency",
      "signals": ["DUST_CONSOLIDATION", "FEE_EFFICIENCY"],
      "references": [0, 5, 12],
      "confidence": 0.85
    }
  ],
  "duration_ms": 1234
}
```

## Response Schema

### Top-Level Fields
- `address` (string): Wallet address requested
- `hits` (number): Number of transactions to ZRouter contract
- `activity_preview` (string): First 2000 chars of decoded activity (for debugging)
- `market_preview` (string): First 1000 chars of market snapshot (for debugging)
- `recommendations` (Recommendation[]): Array of swap recommendations
- `duration_ms` (number): API processing time in milliseconds

### Recommendation Object
- `tokenIn` (TokenMetadata): Token to sell
- `tokenOut` (TokenMetadata): Token to buy
- `amount` (string): Human-readable amount (e.g., "1000", "0.5")
- `side` (string): Either `"SWAP_EXACT_IN"` or `"SWAP_EXACT_OUT"`
  - `SWAP_EXACT_IN`: `amount` is exact input (sell exactly X of tokenIn)
  - `SWAP_EXACT_OUT`: `amount` is exact output (receive exactly X of tokenOut)
- `why` (string): 1-2 sentence explanation
- `signals` (string[]): Category tags (see Signal Types below)
- `references` (number[]): Indexes into activity array (for debugging)
- `confidence` (number | null): 0-1 confidence score (0.85 = 85% confident)

### TokenMetadata Object
- `address` (string): ERC-20 or ERC-6909 contract address (checksummed)
- `id` (string | null): ERC-6909 token ID (null for ERC-20)
- `chainId` (number): Chain ID (1 for Ethereum mainnet)
- `decimals` (number): Token decimals (e.g., 18 for WETH, 6 for USDC)
- `name` (string): Token name
- `symbol` (string): Token symbol
- `imageUrl` (string): Token logo URL (may be IPFS, ensure you resolve it)
- `standard` (string): Either `"ERC20"` or `"ERC6909"`

### Signal Types
- `DUST_CONSOLIDATION`: Small balance cleanup
- `LP_UNWIND`: Exit liquidity position
- `REBALANCE`: Portfolio rebalancing
- `RISK_TRIM`: Reduce exposure to risky assets
- `STABLECOIN_MIGRATION`: Migrate between stablecoins
- `REDUNDANT_ASSET`: Similar token consolidation
- `FEE_EFFICIENCY`: Gas optimization opportunity

## Frontend Implementation

### 1. TypeScript Types

Create `types/recommendations.ts`:

```typescript
export type TokenStandard = 'ERC20' | 'ERC6909';

export type SwapSide = 'SWAP_EXACT_IN' | 'SWAP_EXACT_OUT';

export type RecommendationSignal =
  | 'DUST_CONSOLIDATION'
  | 'LP_UNWIND'
  | 'REBALANCE'
  | 'RISK_TRIM'
  | 'STABLECOIN_MIGRATION'
  | 'REDUNDANT_ASSET'
  | 'FEE_EFFICIENCY';

export interface TokenMetadata {
  address: string;
  id: string | null;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  imageUrl: string;
  standard: TokenStandard;
}

export interface Recommendation {
  tokenIn: TokenMetadata;
  tokenOut: TokenMetadata;
  amount: string;
  side: SwapSide;
  why: string;
  signals: RecommendationSignal[];
  references: number[];
  confidence: number | null;
}

export interface RecommendationsResponse {
  address: string;
  hits: number;
  activity_preview: string;
  market_preview: string;
  recommendations: Recommendation[];
  duration_ms: number;
}
```

### 2. API Service

Create `services/recommendations.ts`:

```typescript
import { RecommendationsResponse } from '../types/recommendations';

const API_BASE_URL = process.env.NEXT_PUBLIC_RECOMMENDATIONS_API || 'https://tx-recs-worker-production.up.railway.app';
const CACHE_KEY_PREFIX = 'swap-recommendations';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedResponse {
  data: RecommendationsResponse;
  timestamp: number;
}

export class RecommendationsService {
  /**
   * Fetch recommendations for a wallet address
   * Automatically caches responses for 24 hours in localStorage
   */
  static async getRecommendations(address: string): Promise<RecommendationsResponse> {
    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${CACHE_KEY_PREFIX}:${normalizedAddress}`;

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      console.log('[Recommendations] Cache hit:', normalizedAddress);
      return cached;
    }

    console.log('[Recommendations] Cache miss, fetching from API:', normalizedAddress);

    // Fetch from API
    const response = await fetch(`${API_BASE_URL}/v1/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to fetch recommendations: ${error.error || error.details || response.statusText}`);
    }

    const data: RecommendationsResponse = await response.json();

    // Cache the response
    this.saveToCache(cacheKey, data);

    return data;
  }

  /**
   * Get cached recommendations if not expired
   */
  private static getFromCache(key: string): RecommendationsResponse | null {
    if (typeof window === 'undefined') return null;

    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const parsed: CachedResponse = JSON.parse(cached);
      const age = Date.now() - parsed.timestamp;

      if (age > CACHE_TTL_MS) {
        // Expired, remove it
        localStorage.removeItem(key);
        return null;
      }

      return parsed.data;
    } catch (error) {
      console.error('[Recommendations] Cache read error:', error);
      return null;
    }
  }

  /**
   * Save recommendations to cache
   */
  private static saveToCache(key: string, data: RecommendationsResponse): void {
    if (typeof window === 'undefined') return;

    try {
      const cached: CachedResponse = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(cached));
    } catch (error) {
      console.error('[Recommendations] Cache write error:', error);
      // Silently fail if localStorage is full or unavailable
    }
  }

  /**
   * Clear cached recommendations for an address
   */
  static clearCache(address: string): void {
    if (typeof window === 'undefined') return;

    const normalizedAddress = address.toLowerCase();
    const cacheKey = `${CACHE_KEY_PREFIX}:${normalizedAddress}`;
    localStorage.removeItem(cacheKey);
  }

  /**
   * Clear all cached recommendations
   */
  static clearAllCache(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage);
      const recommendationKeys = keys.filter(k => k.startsWith(CACHE_KEY_PREFIX));
      recommendationKeys.forEach(k => localStorage.removeItem(k));
    } catch (error) {
      console.error('[Recommendations] Failed to clear cache:', error);
    }
  }
}
```

### 3. React Hook

Create `hooks/useRecommendations.ts`:

```typescript
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi'; // or your wallet library
import { RecommendationsService } from '../services/recommendations';
import type { RecommendationsResponse } from '../types/recommendations';

interface UseRecommendationsResult {
  recommendations: RecommendationsResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useRecommendations(): UseRecommendationsResult {
  const { address } = useAccount();
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRecommendations = async () => {
    if (!address) {
      setRecommendations(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await RecommendationsService.getRecommendations(address);
      setRecommendations(data);
    } catch (err) {
      console.error('[useRecommendations] Error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch recommendations'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [address]);

  return {
    recommendations,
    loading,
    error,
    refetch: fetchRecommendations,
  };
}
```

### 4. UI Component: Recommendations Panel

Create `components/RecommendationsPanel.tsx`:

```typescript
import React from 'react';
import { useRecommendations } from '../hooks/useRecommendations';
import type { Recommendation } from '../types/recommendations';

interface RecommendationsPanelProps {
  onSelectRecommendation: (rec: Recommendation) => void;
}

export function RecommendationsPanel({ onSelectRecommendation }: RecommendationsPanelProps) {
  const { recommendations, loading, error } = useRecommendations();

  if (loading) {
    return (
      <div className="recommendations-panel">
        <h3>AI Recommendations</h3>
        <div className="loading-spinner">Loading personalized swap suggestions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="recommendations-panel">
        <h3>AI Recommendations</h3>
        <div className="error-message">
          Failed to load recommendations. Please try again later.
        </div>
      </div>
    );
  }

  if (!recommendations || recommendations.recommendations.length === 0) {
    return (
      <div className="recommendations-panel">
        <h3>AI Recommendations</h3>
        <div className="empty-state">
          No recommendations available. Try making some swaps first!
        </div>
      </div>
    );
  }

  return (
    <div className="recommendations-panel">
      <h3>AI Recommendations ({recommendations.recommendations.length})</h3>
      <div className="recommendations-list">
        {recommendations.recommendations.map((rec, idx) => (
          <RecommendationCard
            key={idx}
            recommendation={rec}
            onClick={() => onSelectRecommendation(rec)}
          />
        ))}
      </div>
    </div>
  );
}

interface RecommendationCardProps {
  recommendation: Recommendation;
  onClick: () => void;
}

function RecommendationCard({ recommendation, onClick }: RecommendationCardProps) {
  const { tokenIn, tokenOut, amount, side, why, signals, confidence } = recommendation;

  return (
    <button className="recommendation-card" onClick={onClick}>
      <div className="recommendation-header">
        <div className="token-pair">
          <img src={tokenIn.imageUrl} alt={tokenIn.symbol} className="token-icon" />
          <span className="token-symbol">{tokenIn.symbol}</span>
          <span className="arrow">→</span>
          <img src={tokenOut.imageUrl} alt={tokenOut.symbol} className="token-icon" />
          <span className="token-symbol">{tokenOut.symbol}</span>
        </div>
        {confidence !== null && (
          <span className="confidence">{Math.round(confidence * 100)}%</span>
        )}
      </div>

      <div className="recommendation-amount">
        {side === 'SWAP_EXACT_IN' ? 'Sell' : 'Buy'} {amount} {side === 'SWAP_EXACT_IN' ? tokenIn.symbol : tokenOut.symbol}
      </div>

      <div className="recommendation-why">{why}</div>

      {signals.length > 0 && (
        <div className="recommendation-signals">
          {signals.map((signal) => (
            <span key={signal} className={`signal-badge signal-${signal.toLowerCase()}`}>
              {signal.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
```

### 5. Integration into Swap/Trade Page

In your `/trade` page component:

```typescript
import { useState } from 'react';
import { RecommendationsPanel } from '../components/RecommendationsPanel';
import type { Recommendation } from '../types/recommendations';
import { parseUnits } from 'viem'; // or ethers.js

export function TradePage() {
  const [tokenIn, setTokenIn] = useState<TokenMetadata | null>(null);
  const [tokenOut, setTokenOut] = useState<TokenMetadata | null>(null);
  const [amount, setAmount] = useState('');
  const [swapMode, setSwapMode] = useState<'EXACT_IN' | 'EXACT_OUT'>('EXACT_IN');

  const handleRecommendationClick = (rec: Recommendation) => {
    // Auto-fill the swap form with recommendation data
    setTokenIn(rec.tokenIn);
    setTokenOut(rec.tokenOut);
    setAmount(rec.amount);
    setSwapMode(rec.side === 'SWAP_EXACT_IN' ? 'EXACT_IN' : 'EXACT_OUT');

    // Optional: scroll to swap form
    document.getElementById('swap-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="trade-page">
      {/* Swap Form */}
      <div id="swap-form" className="swap-form">
        {/* Your existing swap UI */}
        {/* Token selectors, amount inputs, etc. */}
      </div>

      {/* Recommendations Panel */}
      <RecommendationsPanel onSelectRecommendation={handleRecommendationClick} />
    </div>
  );
}
```

## Styling Recommendations

Example CSS for the recommendations panel:

```css
.recommendations-panel {
  margin-top: 2rem;
  padding: 1.5rem;
  background: var(--surface-bg);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.recommendations-panel h3 {
  margin-bottom: 1rem;
  font-size: 1.25rem;
  font-weight: 600;
}

.recommendations-list {
  display: grid;
  gap: 0.75rem;
}

.recommendation-card {
  padding: 1rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;
}

.recommendation-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.recommendation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.token-pair {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.token-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.token-symbol {
  font-weight: 600;
  font-size: 0.95rem;
}

.arrow {
  color: var(--text-muted);
}

.confidence {
  font-size: 0.85rem;
  color: var(--success-color);
  font-weight: 600;
}

.recommendation-amount {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.recommendation-why {
  font-size: 0.9rem;
  color: var(--text-primary);
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.recommendation-signals {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.signal-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 4px;
  background: var(--badge-bg);
  color: var(--badge-text);
  text-transform: capitalize;
}

.signal-dust_consolidation { background: #fef3c7; color: #92400e; }
.signal-lp_unwind { background: #dbeafe; color: #1e40af; }
.signal-rebalance { background: #e0e7ff; color: #3730a3; }
.signal-risk_trim { background: #fee2e2; color: #991b1b; }
.signal-stablecoin_migration { background: #d1fae5; color: #065f46; }
.signal-redundant_asset { background: #fce7f3; color: #831843; }
.signal-fee_efficiency { background: #ecfccb; color: #365314; }
```

## Best Practices

### 1. Cache Management
- Cache is automatically handled by `RecommendationsService`
- 24-hour TTL prevents stale recommendations
- Clear cache when user makes a swap: `RecommendationsService.clearCache(userAddress)`
- Clear all cache on logout: `RecommendationsService.clearAllCache()`

### 2. Error Handling
- Always handle API errors gracefully (network issues, 500 errors, etc.)
- Show user-friendly error messages
- Optionally add a retry button

### 3. Loading States
- Show loading spinner while fetching recommendations
- Consider skeleton UI for better UX
- Don't block the swap UI while recommendations load

### 4. Empty States
- Show helpful message if no recommendations available
- Suggest user make some swaps first to get personalized recommendations

### 5. Performance
- Recommendations API can take 1-5 seconds on first call (no cache)
- Subsequent calls are instant (cached for 24h)
- Consider fetching recommendations in the background when user visits `/trade`

### 6. Amount Parsing
When using the `amount` field, parse it correctly based on token decimals:

```typescript
import { parseUnits } from 'viem';

const handleRecommendationClick = (rec: Recommendation) => {
  const { amount, tokenIn, tokenOut, side } = rec;

  // Parse amount with correct decimals
  const parsedAmount = parseUnits(
    amount,
    side === 'SWAP_EXACT_IN' ? tokenIn.decimals : tokenOut.decimals
  );

  // Use parsedAmount for contract calls
};
```

### 7. IPFS Images
Token images may be IPFS URLs. Ensure you resolve them:

```typescript
function resolveImageUrl(url: string): string {
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return url;
}

// Usage
<img src={resolveImageUrl(tokenIn.imageUrl)} alt={tokenIn.symbol} />
```

## Testing

### Manual Testing
1. Connect wallet to `/trade` page
2. Verify recommendations load (check network tab)
3. Verify cache works (refresh page, should be instant)
4. Click a recommendation
5. Verify swap form auto-fills correctly
6. Test with different wallet addresses

### API Testing
Use curl or Postman:

```bash
curl -X POST https://tx-recs-worker-production.up.railway.app/v1/recommendations \
  -H "Content-Type: application/json" \
  -d '{"address":"0x742d35Cc6634C0532925a3b844Bc454e4438f44e"}'
```

## Environment Variables

Add to your `.env.local`:

```bash
NEXT_PUBLIC_RECOMMENDATIONS_API=https://tx-recs-worker-production.up.railway.app
```

## Rate Limiting Considerations

- Backend caches user activity for 15 minutes
- Frontend caches recommendations for 24 hours
- Minimal API calls once cache is warmed
- No rate limiting currently implemented, but recommend adding user-level throttling on frontend (e.g., max 1 request per minute per user)

## Support & Debugging

If recommendations aren't loading:
1. Check browser console for errors
2. Check network tab for API response
3. Verify `NEXT_PUBLIC_RECOMMENDATIONS_API` is set correctly
4. Check localStorage for cached data
5. Try clearing cache: `RecommendationsService.clearAllCache()`

Response includes `activity_preview` and `market_preview` for debugging purposes.

---

## Example: Full Integration Checklist

- [ ] Add TypeScript types (`types/recommendations.ts`)
- [ ] Implement API service with caching (`services/recommendations.ts`)
- [ ] Create React hook (`hooks/useRecommendations.ts`)
- [ ] Build recommendations UI component (`components/RecommendationsPanel.tsx`)
- [ ] Integrate into `/trade` page
- [ ] Add CSS styling
- [ ] Set `NEXT_PUBLIC_RECOMMENDATIONS_API` environment variable
- [ ] Test with real wallet
- [ ] Verify cache works (check localStorage)
- [ ] Verify auto-fill works when clicking recommendation
- [ ] Add error handling and empty states
- [ ] Deploy and verify in production

## Questions?

Refer to the API repository's `CLAUDE.md` for backend implementation details or open an issue if you encounter problems.
