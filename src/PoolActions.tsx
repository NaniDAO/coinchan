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
      {/* Header with mode switcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: '30px',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <h2 style={{ 
          margin: 0,
          fontFamily: 'var(--font-display)',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          fontSize: '18px'
        }}>═══ SWAP TERMINAL ═══</h2>
        
        <div style={{
          display: 'flex',
          gap: '0',
          border: '2px solid var(--terminal-black)',
          background: 'var(--terminal-gray)',
          padding: '3px'
        }}>
          <button
            onClick={() => setMode('swap')}
            style={{
              background: mode === 'swap' ? 'var(--terminal-black)' : 'transparent',
              color: mode === 'swap' ? 'var(--terminal-white)' : 'var(--terminal-black)',
              border: 'none',
              padding: '12px 24px',
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.1s ease',
              fontFamily: 'var(--font-body)'
            }}
          >
            SWAP
          </button>
          <button
            onClick={() => setMode('liquidity')}
            style={{
              background: mode === 'liquidity' ? 'var(--terminal-black)' : 'transparent',
              color: mode === 'liquidity' ? 'var(--terminal-white)' : 'var(--terminal-black)',
              border: 'none',
              padding: '12px 24px',
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              transition: 'all 0.1s ease',
              fontFamily: 'var(--font-body)'
            }}
          >
            LIQUIDITY
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