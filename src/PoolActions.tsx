import { useState } from "react";

import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { LiquidityActions } from "./LiquidityActions";
import { SwapAction } from "./SwapAction";
import { LoadingLogo } from "./components/ui/loading-logo";

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants - Simplified to focus on core swap functionality
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "liquidity";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions - Terminal Style
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
  const [mode, setMode] = useState<TileMode>("swap");
  const { tokenCount, loading, error: loadError } = useAllCoins();

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  // Main UI
  return (
    <div className="swap-container">
      {/* Header with mode switcher matching HTML design */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ 
          margin: 0,
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontSize: '18px'
        }}>═══ SWAP TERMINAL ═══</h2>
        
        <div className="button-group">
          <button
            className={`button ${mode === 'swap' ? 'swap-mode-active' : ''}`}
            onClick={() => setMode('swap')}
            style={{ 
              padding: '8px 12px', 
              fontSize: '12px',
              border: 'none',
              margin: '0'
            }}
          >
            SWAP
          </button>
          <button
            className={`button ${mode === 'liquidity' ? 'swap-mode-active' : ''}`}
            onClick={() => setMode('liquidity')}
            style={{ 
              padding: '8px 12px', 
              fontSize: '12px',
              border: 'none',
              margin: '0'
            }}
          >
            ADD
          </button>
        </div>
      </div>

      {/* Info showing token count */}
      <div style={{ 
        fontSize: '12px', 
        marginBottom: '20px',
        textAlign: 'center',
        fontFamily: 'monospace'
      }}>
        Available tokens: {tokenCount} (ETH + {tokenCount - 1} coins)
      </div>

      {/* Load error notification */}
      {loadError && (
        <div style={{
          padding: '10px',
          marginBottom: '20px',
          backgroundColor: 'var(--terminal-gray)',
          border: '2px solid var(--terminal-black)',
          fontSize: '12px',
          textAlign: 'center'
        }}>
          {loadError}
        </div>
      )}

      {/* Content based on mode */}
      {mode === "swap" && <SwapAction />}
      {mode === "liquidity" && <LiquidityActions />}
    </div>
  );
};

export default PoolActions;