# Chart Embed Integration

Embed ZAMM pool charts (line or candlestick) into any dApp using an iframe.

**No API key required. No dependencies.**

## Quick Start

```html
<!-- Line chart -->
<iframe
  src="https://www.zamm.finance/embed/pool/1/{poolId}?theme=dark"
  width="100%"
  height="500"
  style="border: none; border-radius: 8px;"
  sandbox="allow-scripts allow-same-origin"
></iframe>

<!-- Candlestick chart -->
<iframe
  src="https://www.zamm.finance/embed/pool/1/{poolId}?type=candle&theme=dark"
  width="100%"
  height="500"
  style="border: none; border-radius: 8px;"
  sandbox="allow-scripts allow-same-origin"
></iframe>
```

Replace `{poolId}` with the numeric ZAMM pool ID.

## URL Format

```
https://www.zamm.finance/embed/pool/{chainId}/{poolId}?type={type}&theme={theme}&range={range}&interval={interval}
```

## Query Parameters

| Param      | Values                     | Default | Applies to   |
| ---------- | -------------------------- | ------- | ------------ |
| `type`     | `line`, `candle`           | `line`  | Both         |
| `theme`    | `light`, `dark`            | system  | Both         |
| `range`    | `24h`, `1w`, `1m`, `all`   | `1w`    | Line only    |
| `interval` | `1h`, `1d`                 | `1h`    | Candle only  |

## Chart Types

### Line Chart (`type=line`)

- Area chart showing price history over time
- Time range selector (24h / 1w / 1m / all)
- ETH/USD price toggle
- Hover tooltips

### Candlestick Chart (`type=candle`)

- OHLC candlestick chart with green/red candles
- Interval selector (1h / 1d)
- ETH/USD price toggle
- Crosshair with price/time display
- Scroll left to load older candles
- Pinch-to-zoom on mobile

## Examples

```
# Line chart, dark theme, 1 month range
/embed/pool/1/42?type=line&theme=dark&range=1m

# Candle chart, light theme, daily candles
/embed/pool/1/42?type=candle&theme=light&interval=1d

# Candle chart, dark theme, hourly candles (defaults)
/embed/pool/1/42?type=candle&theme=dark
```

## Theme Sync via postMessage

To sync your dApp's theme with the embedded chart at runtime:

```js
const frame = document.getElementById("chart-frame");

function syncTheme(theme) {
  frame.contentWindow.postMessage({ type: "theme", value: theme }, "*");
}
```

Or simply update the iframe `src` to change the `theme` param.

## Toggling Chart Type

To let users switch between line and candle:

```js
function setChartType(poolId, type) {
  const theme = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
  document.getElementById("chart-frame").src =
    `https://www.zamm.finance/embed/pool/1/${poolId}?type=${type}&theme=${theme}`;
}
```

```html
<button onclick="setChartType('42', 'line')">Line</button>
<button onclick="setChartType('42', 'candle')">Candle</button>
<iframe id="chart-frame" width="100%" height="500" style="border: none;"></iframe>
```

## Data Source

Both chart types pull data from the Coinchan indexer:

- **Line chart**: Aggregated price points via `fetchPoolPricePoints()`
- **Candle chart**: OHLC candles via `fetchPoolCandles()`

Data comes from on-chain swap events indexed in real-time. The charts display the same data shown on the main ZAMM trading pages.

## Supported Networks

| Chain ID | Network          |
| -------- | ---------------- |
| `1`      | Ethereum Mainnet |
