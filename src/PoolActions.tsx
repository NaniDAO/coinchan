import { useState } from "react";

import { useAllCoins } from "./hooks/metadata/use-all-coins";
import { LiquidityActions } from "./LiquidityActions";
import { SwapAction } from "./SwapAction";
import CoinchanLoader from "./components/CoinchanLoader";

/* ────────────────────────────────────────────────────────────────────────────
  Mode types and constants
──────────────────────────────────────────────────────────────────────────── */
type TileMode = "swap" | "add" | "remove";

/* ────────────────────────────────────────────────────────────────────────────
  Pool Actions - Terminal Style
──────────────────────────────────────────────────────────────────────────── */
export const PoolActions = () => {
  const [mode, setMode] = useState<TileMode>("swap");
  const { tokenCount, loading, error: loadError } = useAllCoins();

  // Loading state
  if (loading) {
    return <CoinchanLoader />;
  }

  // Main UI
  return (
    <div className="swap-container">
      {/* Header with mode switcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0 }}>═══ SWAP TERMINAL ═══</h2>
        <div className="button-group">
          <button
            className={`button ${mode === 'swap' ? 'swap-mode-active' : ''}`}
            onClick={() => setMode('swap')}
            style={{ padding: '8px 12px', fontSize: '12px' }}
          >
            SWAP
          </button>
          <button
            className={`button ${mode === 'add' ? 'swap-mode-active' : ''}`}
            onClick={() => setMode('add')}
            style={{ padding: '8px 12px', fontSize: '12px' }}
          >
            ADD
          </button>
          <button
            className={`button ${mode === 'remove' ? 'swap-mode-active' : ''}`}
            onClick={() => setMode('remove')}
            style={{ padding: '8px 12px', fontSize: '12px' }}
          >
            REMOVE
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
      {mode === "add" && <LiquidityActions />}
      {mode === "remove" && <LiquidityActions />}
    </div>
  );
};

export default PoolActions;