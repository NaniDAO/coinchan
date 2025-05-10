# Chart Implementation Guidelines

## Current Implementation

We've enhanced the chart data fetching and visualization with several improvements:

1. Support for more flexible timeframes (1m, 5m, 15m, 30m, 1h, 4h, 12h, 1d, 1w)
2. Added volume data to the GraphQL queries
3. Created a unified chart component that can toggle between line and candle views
4. Implemented advanced technical indicators (Moving Averages, RSI)
5. Added enhanced tooltips and interactive elements

Due to TypeScript compatibility issues with the lightweight-charts library, we've temporarily replaced the fully featured chart with a minimal debug version that shows data is being retrieved correctly.

## Deployment Workarounds

To successfully build the project with our chart implementations, you have two options:

### Option 1: Use the MinimalChart component (current approach)

We're currently using a simplified `MinimalChart` component that:
- Loads data correctly from the indexer
- Offers timeframe selection
- Provides a debug view for troubleshooting
- Avoids the TypeScript errors with the chart library

### Option 2: Configure TypeScript to ignore problematic files

1. Create a `tsconfig.build.json` file with:
```json
{
  "extends": "./tsconfig.json",
  "exclude": [
    "**/*.old.tsx",
    "**/*.old.ts", 
    "**/node_modules"
  ]
}
```

2. Update the build script in package.json:
```json
"scripts": {
  "build": "tsc -p tsconfig.build.json && vite build",
}
```

## Debugging Tips

If the charts aren't displaying data properly:

1. Click the "Debug" button in the top right corner of the chart to see:
   - The raw data being loaded
   - Your environment configuration
   - Any error messages

2. Check that `VITE_INDEXER_URL` is properly set in your environment

3. Verify the poolId is being correctly computed and passed to the chart component

## Future Improvements

Once we resolve the TypeScript issues, we can:

1. Re-enable the fully featured chart with all indicators
2. Add more interactive elements to the chart
3. Implement price comparison features
4. Add more detailed volume analysis
5. Create advanced charting tools for technical analysis