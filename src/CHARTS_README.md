# Chart Component Implementation

This directory contains multiple chart implementations for displaying price and candle data:

- **MinimalChart.tsx** - A simplified placeholder chart implementation that loads data but doesn't render the actual chart. This is used for deployment when there are TypeScript issues with the more advanced components.

- **PoolPriceChart.old.tsx** - The original price line chart component using lightweight-charts.

- **PoolCandleChart.old.tsx** - The original candlestick chart component using lightweight-charts.

- **UnifiedChartComponent.old.tsx** - An enhanced chart component that combines both line and candlestick charts with volume bars and indicators.

- **SimplifiedUnifiedChart.old.tsx** - A simplified version of the unified chart component.

## Current Issues

There are TypeScript compatibility issues with the lightweight-charts library interfaces that need to be resolved. In particular:

1. Series creation methods have changed in newer versions of the library
2. Time data type handling needs to be updated to be compatible with the library's expected format
3. Series options need to be correctly typed

## Future Improvements

The full implementation should include:

1. Volume bars display
2. Technical indicators (MA, RSI, etc.)
3. Cross-platform compatibility
4. Multiple timeframe selection
5. Enhanced tooltips

## Usage

Currently, the `MinimalChart` component is being used in production as a placeholder until the TypeScript issues are resolved with the more advanced chart implementations.