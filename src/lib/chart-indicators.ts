/**
 * Trading chart technical indicators implementation
 * Used by the UnifiedChartComponent
 */

import { CandleData, PricePointData } from "./indexer";

export interface IndicatorData {
  time: number;
  value: number;
}

/**
 * Calculate Simple Moving Average (SMA)
 * @param data Source candle data
 * @param period The period to calculate the MA for
 * @returns Array of {time, value} points
 */
export function calculateSMA(data: CandleData[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // Not enough data for this period yet
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    
    result.push({
      time: data[i].date,
      value: sum / period,
    });
  }
  
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * @param data Source candle data
 * @param period The period to calculate the EMA for
 * @returns Array of {time, value} points
 */
export function calculateEMA(data: CandleData[], period: number): IndicatorData[] {
  const result: IndicatorData[] = [];
  const multiplier = 2 / (period + 1);
  let ema: number | null = null;
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // Not enough data
      continue;
    }
    
    if (ema === null) {
      // First EMA is calculated as SMA
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += data[i - j].close;
      }
      ema = sum / period;
    } else {
      // EMA formula: (Close - Previous EMA) * multiplier + Previous EMA
      ema = (data[i].close - ema) * multiplier + ema;
    }
    
    result.push({
      time: data[i].date,
      value: ema,
    });
  }
  
  return result;
}

/**
 * Calculate Relative Strength Index (RSI)
 * @param data Source candle data
 * @param period The period to calculate RSI for (typically 14)
 * @returns Array of {time, value} points with RSI values (0-100)
 */
export function calculateRSI(data: CandleData[], period: number = 14): IndicatorData[] {
  const result: IndicatorData[] = [];
  if (data.length <= period) return result;
  
  // Calculate price changes
  const changes: number[] = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].close - data[i-1].close);
  }
  
  // Get initial averages
  let avgGain = 0;
  let avgLoss = 0;
  
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) {
      avgGain += changes[i];
    } else {
      avgLoss += Math.abs(changes[i]);
    }
  }
  
  avgGain /= period;
  avgLoss /= period;
  
  // Calculate first RSI
  let rs = avgGain / (avgLoss === 0 ? 0.001 : avgLoss); // Avoid division by zero
  let rsi = 100 - (100 / (1 + rs));
  
  result.push({
    time: data[period].date,
    value: rsi
  });
  
  // Calculate RSI for the rest of the data
  for (let i = period + 1; i < data.length; i++) {
    const change = changes[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    // Use Wilder's smoothing method
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    
    rs = avgGain / (avgLoss === 0 ? 0.001 : avgLoss);
    rsi = 100 - (100 / (1 + rs));
    
    result.push({
      time: data[i].date,
      value: rsi
    });
  }
  
  return result;
}

/**
 * Calculate Bollinger Bands
 * @param data Source candle data
 * @param period The period for the moving average (typically 20)
 * @param multiplier Standard deviation multiplier (typically 2)
 * @returns Object with upperBand, middleBand, and lowerBand arrays
 */
export function calculateBollingerBands(
  data: CandleData[], 
  period: number = 20, 
  multiplier: number = 2
): { 
  upperBand: IndicatorData[], 
  middleBand: IndicatorData[], 
  lowerBand: IndicatorData[] 
} {
  const upperBand: IndicatorData[] = [];
  const middleBand: IndicatorData[] = [];
  const lowerBand: IndicatorData[] = [];
  
  for (let i = period - 1; i < data.length; i++) {
    // Calculate SMA (middle band)
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close;
    }
    const sma = sum / period;
    
    // Calculate standard deviation
    let squaredDiffSum = 0;
    for (let j = 0; j < period; j++) {
      const diff = data[i - j].close - sma;
      squaredDiffSum += diff * diff;
    }
    const stdDev = Math.sqrt(squaredDiffSum / period);
    
    // Calculate bands
    const upper = sma + (multiplier * stdDev);
    const lower = sma - (multiplier * stdDev);
    
    middleBand.push({ time: data[i].date, value: sma });
    upperBand.push({ time: data[i].date, value: upper });
    lowerBand.push({ time: data[i].date, value: lower });
  }
  
  return { upperBand, middleBand, lowerBand };
}

/**
 * Calculate Moving Average Convergence Divergence (MACD)
 * @param data Source candle data
 * @param fastPeriod Fast EMA period (typically 12)
 * @param slowPeriod Slow EMA period (typically 26)
 * @param signalPeriod Signal EMA period (typically 9)
 * @returns Object with macdLine, signalLine and histogram arrays
 */
export function calculateMACD(
  data: CandleData[], 
  fastPeriod: number = 12, 
  slowPeriod: number = 26, 
  signalPeriod: number = 9
): { 
  macdLine: IndicatorData[], 
  signalLine: IndicatorData[], 
  histogram: IndicatorData[] 
} {
  // Calculate fast and slow EMAs
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine: IndicatorData[] = [];
  let i = 0, j = 0;
  
  while (i < fastEMA.length && j < slowEMA.length) {
    if (fastEMA[i].time < slowEMA[j].time) {
      i++;
    } else if (fastEMA[i].time > slowEMA[j].time) {
      j++;
    } else {
      // Times match, calculate MACD
      macdLine.push({
        time: fastEMA[i].time,
        value: fastEMA[i].value - slowEMA[j].value
      });
      i++;
      j++;
    }
  }
  
  // Not enough data
  if (macdLine.length < signalPeriod) {
    return { macdLine, signalLine: [], histogram: [] };
  }
  
  // Calculate signal line (EMA of MACD line)
  const signalLine: IndicatorData[] = [];
  let signalEMA: number | null = null;
  const multiplier = 2 / (signalPeriod + 1);
  
  for (let i = 0; i < macdLine.length; i++) {
    if (i < signalPeriod - 1) {
      continue;
    }
    
    if (signalEMA === null) {
      // First signal is SMA of MACD line
      let sum = 0;
      for (let j = 0; j < signalPeriod; j++) {
        sum += macdLine[i - j].value;
      }
      signalEMA = sum / signalPeriod;
    } else {
      signalEMA = (macdLine[i].value - signalEMA) * multiplier + signalEMA;
    }
    
    signalLine.push({
      time: macdLine[i].time,
      value: signalEMA
    });
  }
  
  // Calculate histogram (MACD line - signal line)
  const histogram: IndicatorData[] = [];
  i = 0; 
  j = 0;
  
  while (i < macdLine.length && j < signalLine.length) {
    if (macdLine[i].time < signalLine[j].time) {
      i++;
    } else if (macdLine[i].time > signalLine[j].time) {
      j++;
    } else {
      // Times match, calculate histogram
      histogram.push({
        time: macdLine[i].time,
        value: macdLine[i].value - signalLine[j].value
      });
      i++;
      j++;
    }
  }
  
  return { macdLine, signalLine, histogram };
}

/**
 * Calculate Average True Range (ATR)
 * @param data Source candle data
 * @param period Period for ATR calculation (typically 14)
 * @returns Array of {time, value} points with ATR values
 */
export function calculateATR(data: CandleData[], period: number = 14): IndicatorData[] {
  const result: IndicatorData[] = [];
  if (data.length <= period) return result;
  
  // Calculate true ranges
  const trueRanges: number[] = [];
  
  // First true range is just the high - low
  trueRanges.push(data[0].high - data[0].low);
  
  // Calculate subsequent true ranges
  for (let i = 1; i < data.length; i++) {
    const tr1 = data[i].high - data[i].low; // Current high - low
    const tr2 = Math.abs(data[i].high - data[i-1].close); // Current high - previous close
    const tr3 = Math.abs(data[i].low - data[i-1].close); // Current low - previous close
    
    // True range is the greatest of the three
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }
  
  // Calculate first ATR as simple average of true ranges
  let atr = 0;
  for (let i = 0; i < period; i++) {
    atr += trueRanges[i];
  }
  atr /= period;
  
  result.push({
    time: data[period - 1].date,
    value: atr
  });
  
  // Calculate ATR using smoothing method
  for (let i = period; i < data.length; i++) {
    // Wilder's smoothing method: ATR = ((Prior ATR * (period-1)) + Current TR) / period
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
    
    result.push({
      time: data[i].date,
      value: atr
    });
  }
  
  return result;
}

/**
 * Calculate Volume Weighted Average Price (VWAP)
 * @param data Source candle data
 * @returns Array of {time, value} points with VWAP values
 */
export function calculateVWAP(data: CandleData[]): IndicatorData[] {
  const result: IndicatorData[] = [];
  let cumulativeTPV = 0; // Typical Price * Volume
  let cumulativeVolume = 0;
  
  for (let i = 0; i < data.length; i++) {
    const typicalPrice = (data[i].high + data[i].low + data[i].close) / 3;
    const volume = data[i].volume || 0;
    
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
    
    const vwap = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
    
    result.push({
      time: data[i].date,
      value: vwap
    });
  }
  
  return result;
}

/**
 * Calculate Stochastic Oscillator
 * @param data Source candle data
 * @param period K period (typically 14)
 * @param smoothK K smoothing period (typically 3)
 * @param smoothD D period (typically 3)
 * @returns Object with k and d line arrays
 */
export function calculateStochastic(
  data: CandleData[], 
  period: number = 14, 
  smoothK: number = 3, 
  smoothD: number = 3
): { 
  k: IndicatorData[], 
  d: IndicatorData[] 
} {
  const kLine: IndicatorData[] = [];
  const rawK: number[] = [];
  
  // Calculate raw K values
  for (let i = period - 1; i < data.length; i++) {
    let highestHigh = data[i].high;
    let lowestLow = data[i].low;
    
    // Find highest high and lowest low over the period
    for (let j = 0; j < period; j++) {
      highestHigh = Math.max(highestHigh, data[i - j].high);
      lowestLow = Math.min(lowestLow, data[i - j].low);
    }
    
    // %K = (Current Close - Lowest Low) / (Highest High - Lowest Low) * 100
    const range = highestHigh - lowestLow;
    const k = range > 0 ? ((data[i].close - lowestLow) / range) * 100 : 50;
    rawK.push(k);
  }
  
  // Smooth K values
  for (let i = smoothK - 1; i < rawK.length; i++) {
    let sum = 0;
    for (let j = 0; j < smoothK; j++) {
      sum += rawK[i - j];
    }
    const smoothedK = sum / smoothK;
    
    kLine.push({
      time: data[i + period - 1].date,
      value: smoothedK
    });
  }
  
  // Calculate D line (moving average of K)
  const dLine: IndicatorData[] = [];
  
  for (let i = smoothD - 1; i < kLine.length; i++) {
    let sum = 0;
    for (let j = 0; j < smoothD; j++) {
      sum += kLine[i - j].value;
    }
    const d = sum / smoothD;
    
    dLine.push({
      time: kLine[i].time,
      value: d
    });
  }
  
  return { k: kLine, d: dLine };
}

/**
 * Calculate Ichimoku Cloud
 * @param data Source candle data
 * @param conversionPeriod Tenkan-sen period (typically 9)
 * @param basePeriod Kijun-sen period (typically 26)
 * @param spanBPeriod Senkou Span B period (typically 52)
 * @param displacement Chikou Span displacement (typically 26)
 * @returns Object with all Ichimoku components
 */
export function calculateIchimoku(
  data: CandleData[],
  conversionPeriod: number = 9,
  basePeriod: number = 26,
  spanBPeriod: number = 52,
  displacement: number = 26
): {
  conversionLine: IndicatorData[],
  baseLine: IndicatorData[],
  leadingSpanA: IndicatorData[],
  leadingSpanB: IndicatorData[],
  laggingSpan: IndicatorData[]
} {
  const conversionLine: IndicatorData[] = [];
  const baseLine: IndicatorData[] = [];
  const leadingSpanA: IndicatorData[] = [];
  const leadingSpanB: IndicatorData[] = [];
  const laggingSpan: IndicatorData[] = [];
  
  // Calculate conversion line (Tenkan-sen)
  for (let i = conversionPeriod - 1; i < data.length; i++) {
    let highestHigh = data[i].high;
    let lowestLow = data[i].low;
    
    for (let j = 0; j < conversionPeriod; j++) {
      highestHigh = Math.max(highestHigh, data[i - j].high);
      lowestLow = Math.min(lowestLow, data[i - j].low);
    }
    
    conversionLine.push({
      time: data[i].date,
      value: (highestHigh + lowestLow) / 2
    });
  }
  
  // Calculate base line (Kijun-sen)
  for (let i = basePeriod - 1; i < data.length; i++) {
    let highestHigh = data[i].high;
    let lowestLow = data[i].low;
    
    for (let j = 0; j < basePeriod; j++) {
      highestHigh = Math.max(highestHigh, data[i - j].high);
      lowestLow = Math.min(lowestLow, data[i - j].low);
    }
    
    baseLine.push({
      time: data[i].date,
      value: (highestHigh + lowestLow) / 2
    });
  }
  
  // Calculate leading span A (Senkou Span A)
  for (let i = 0; i < conversionLine.length && i < baseLine.length; i++) {
    if (conversionLine[i].time === baseLine[i].time) {
      leadingSpanA.push({
        // Displaced forward
        time: conversionLine[i].time + (displacement * 86400), // Add days in seconds
        value: (conversionLine[i].value + baseLine[i].value) / 2
      });
    }
  }
  
  // Calculate leading span B (Senkou Span B)
  for (let i = spanBPeriod - 1; i < data.length; i++) {
    let highestHigh = data[i].high;
    let lowestLow = data[i].low;
    
    for (let j = 0; j < spanBPeriod; j++) {
      highestHigh = Math.max(highestHigh, data[i - j].high);
      lowestLow = Math.min(lowestLow, data[i - j].low);
    }
    
    leadingSpanB.push({
      // Displaced forward
      time: data[i].date + (displacement * 86400), // Add days in seconds
      value: (highestHigh + lowestLow) / 2
    });
  }
  
  // Calculate lagging span (Chikou Span)
  for (let i = displacement; i < data.length; i++) {
    laggingSpan.push({
      // Displaced backward
      time: data[i].date - (displacement * 86400), // Subtract days in seconds
      value: data[i].close
    });
  }
  
  return {
    conversionLine,
    baseLine,
    leadingSpanA,
    leadingSpanB,
    laggingSpan
  };
}