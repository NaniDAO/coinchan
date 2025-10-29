import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function trunc(value: number | string, length = 3): string {
  return value.toString().slice(0, length) + "..." + value.toString().slice(-length);
}

/**
 * Helper to create a nowSec function for deadline calculations
 * @returns Current timestamp in seconds as BigInt
 */
export const nowSec = () => BigInt(Math.floor(Date.now() / 1000));

/**
 * Format a number with commas as thousands separators
 * @param value The number to format
 * @param decimals Number of decimal places to include (default: 2)
 * @returns Formatted string with thousands separators
 */
export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format ETH amounts with appropriate precision
 * For very small amounts, uses exponential notation or high precision
 * @param value The ETH amount to format
 * @returns Formatted string with appropriate precision
 */
export function formatEthAmount(value: number): string {
  if (value === 0) return "0";

  // For very small values (less than 0.00000001), use exponential notation
  if (value < 0.00000001 && value > 0) {
    return value.toExponential(4);
  }

  // For small values, show up to 12 decimal places, removing trailing zeros
  if (value < 0.01) {
    const formatted = value.toFixed(12);
    // Remove trailing zeros and unnecessary decimal point
    return formatted.replace(/\.?0+$/, "");
  }

  // For normal values, use standard formatting
  return formatNumber(value, 8);
}

/**
 * Format a number for display in input fields with comma thousands separators
 * Handles integers without decimals for token amounts
 * @param value The number to format
 * @returns Formatted string with commas, no decimals for integers
 */
export function formatNumberInput(value: number | string): string {
  const num = typeof value === "string" ? Number.parseFloat(value) : value;
  if (isNaN(num)) return "";

  // For whole numbers, don't show decimals
  if (Number.isInteger(num)) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  }

  // For decimals, preserve the original precision
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 20, // Allow many decimals for precise values
  }).format(num);
}

/**
 * Parse a formatted number string (with commas) back to a number
 * @param value The formatted string to parse
 * @returns The parsed number, or NaN if invalid
 */
export function parseNumberInput(value: string): number {
  // Remove commas and parse
  const cleaned = value.replace(/,/g, "");
  return Number.parseFloat(cleaned);
}

/**
 * Clean and validate number input, removing commas for processing
 * @param value The input value
 * @returns Cleaned string suitable for number parsing
 */
export function cleanNumberInput(value: string): string {
  return value.replace(/,/g, "");
}

/**
 * Create a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last invocation.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced function
 */
export function debounce<T extends (...args: any[]) => any>(func: T, wait = 300): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (this: any, ...args: Parameters<T>): void {
    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(this, args);
      timeout = null;
    }, wait);
  };
}

/**
 * Handle number input change with comma formatting
 * @param value The input value
 * @param callback Function to call with the cleaned numeric value
 */
export function handleNumberInputChange(value: string, callback: (cleanValue: string) => void): void {
  // Remove commas for processing
  const cleaned = cleanNumberInput(value);

  // Only allow numbers, decimals, and empty string
  if (cleaned === "" || /^\d*\.?\d*$/.test(cleaned)) {
    callback(cleaned);
  }
}

/**
 * Format a deadline timestamp for display
 * @param deadline Unix timestamp in seconds
 * @returns Object with formatted time and urgency level
 */
export function formatDeadline(deadline: number): {
  text: string;
  urgency: "expired" | "urgent" | "warning" | "normal";
} {
  const now = Date.now();
  const deadlineMs = deadline * 1000;
  const timeDiff = deadlineMs - now;

  if (timeDiff <= 0) {
    return { text: "EXPIRED", urgency: "expired" };
  }

  const minutes = Math.floor(timeDiff / (1000 * 60));
  const hours = Math.floor(timeDiff / (1000 * 60 * 60));
  const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

  if (minutes < 60) {
    return {
      text: `${minutes}m left`,
      urgency: minutes < 30 ? "urgent" : "warning",
    };
  } else if (hours < 24) {
    return {
      text: `${hours}h left`,
      urgency: hours < 6 ? "urgent" : hours < 12 ? "warning" : "normal",
    };
  } else {
    return {
      text: `${days}d left`,
      urgency: days < 2 ? "warning" : "normal",
    };
  }
}

/**
 * Safely format numbers for display with overflow protection
 * @param value The number or string to format
 * @param maxDecimals Maximum decimal places to show
 * @param maxLength Maximum total character length
 * @param useAbbreviation Whether to use K/M/B abbreviations for large numbers
 * @returns Formatted string safe for UI display
 */
export function formatDisplayNumber(
  value: string | number | bigint,
  maxDecimals = 6,
  maxLength = 12,
  useAbbreviation = false,
): string {
  const num = typeof value === "string" ? Number.parseFloat(value) : typeof value === "bigint" ? Number(value) : value;
  if (isNaN(num) || !isFinite(num)) return "0";

  // For very large numbers, use abbreviations if enabled
  if (useAbbreviation) {
    if (num >= 1e12) return (num / 1e12).toFixed(2) + "T";
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  }

  // For very large numbers without abbreviation, use scientific notation
  if (num >= 1e12) return num.toExponential(2);

  // For very small numbers, use scientific notation
  if (num > 0 && num < 1e-6) return num.toExponential(2);

  // Handle zero
  if (num === 0) return "0";

  // Smart decimal places based on magnitude
  let decimals = maxDecimals;
  if (num >= 1000) decimals = Math.min(maxDecimals, 2);
  else if (num >= 100) decimals = Math.min(maxDecimals, 3);
  else if (num >= 10) decimals = Math.min(maxDecimals, 4);

  let formatted = num.toFixed(decimals);

  // Remove trailing zeros
  formatted = formatted.replace(/\.?0+$/, "");

  // If still too long, reduce decimals progressively
  while (formatted.length > maxLength && decimals > 0) {
    decimals--;
    formatted = num.toFixed(decimals).replace(/\.?0+$/, "");
  }

  // Last resort: use scientific notation if still too long
  if (formatted.length > maxLength) {
    return num.toExponential(2);
  }

  return formatted;
}

/**
 * Format reward rates with intelligent precision
 * @param perSecond Rate per second as string
 * @param symbol Token symbol
 * @returns Formatted display string
 */
export function formatRewardRate(perSecond: string, symbol = ""): string {
  const num = Number.parseFloat(perSecond);
  if (isNaN(num) || num === 0) return `0 ${symbol}/sec`;

  // For very small per-second rates, show per day instead
  if (num < 0.001) {
    const perDay = num * 86400;
    return `${formatDisplayNumber(perDay, 4, 10)} ${symbol}/day`;
  }

  return `${formatDisplayNumber(num, 6, 10)} ${symbol}/sec`;
}

/**
 * Format balance amounts with appropriate precision
 * @param amount Amount as string or number
 * @param symbol Token symbol
 * @param maxLength Maximum display length
 * @returns Formatted balance string
 */
export function formatBalance(amount: string | number | bigint, symbol = ""): string {
  return symbol ? `${Number(amount).toFixed(2)} ${symbol}` : amount.toString();
}

/**
 * Format USDT amount (6 decimals) with commas and appropriate precision
 * @param amount The amount in USDT base units (1e6 = 1 USDT)
 * @param includeSymbol Whether to include the "USDT" suffix
 * @returns Formatted USDT string with commas
 */
export function formatUSDT(amount: bigint | number | string, includeSymbol = false): string {
  const amountBigInt = typeof amount === "bigint" ? amount : BigInt(amount);
  const usdtValue = Number(amountBigInt) / 1_000_000; // Convert from 6 decimals

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(usdtValue);

  return includeSymbol ? `${formatted} USDT` : formatted;
}

/**
 * Format USDT amount in abbreviated form (K, M, B) for compact display
 * @param amount The amount in USDT base units (1e6 = 1 USDT)
 * @param includeSymbol Whether to include the "USDT" suffix
 * @returns Formatted USDT string with abbreviation
 */
export function formatUSDTCompact(amount: bigint | number | string, includeSymbol = false): string {
  const amountBigInt = typeof amount === "bigint" ? amount : BigInt(amount);
  const usdtValue = Number(amountBigInt) / 1_000_000; // Convert from 6 decimals

  let formatted: string;
  if (usdtValue >= 1e9) {
    formatted = (usdtValue / 1e9).toFixed(2) + "B";
  } else if (usdtValue >= 1e6) {
    formatted = (usdtValue / 1e6).toFixed(2) + "M";
  } else if (usdtValue >= 1e3) {
    formatted = (usdtValue / 1e3).toFixed(2) + "K";
  } else {
    formatted = usdtValue.toFixed(2);
  }

  return includeSymbol ? `${formatted} USDT` : formatted;
}

export const generateRandomSlug = () => {
  const words = [
    "apple",
    "banana",
    "cherry",
    "date",
    "elderberry",
    "fig",
    "grape",
    "honeydew",
    "kiwi",
    "lemon",
    "mango",
    "nectarine",
    "orange",
    "papaya",
    "quince",
    "raspberry",
    "strawberry",
    "tangerine",
    "ugli",
    "vanilla",
    "watermelon",
    "xigua",
    "yuzu",
    "zucchini",
    "apricot",
    "blueberry",
    "cranberry",
    "durian",
    "eggplant",
    "gooseberry",
    "huckleberry",
    "jackfruit",
    "kumquat",
    "lime",
    "lychee",
    "mulberry",
    "olive",
    "pear",
    "peach",
    "plum",
    "pomegranate",
    "pineapple",
    "rhubarb",
    "satsuma",
    "tomato",
    "walnut",
    "pecan",
    "almond",
    "cashew",
    "pistachio",
  ];

  const getRandomWord = () => {
    const randomIndex = Math.floor(Math.random() * words.length);
    return words[randomIndex];
  };

  const word1 = getRandomWord();
  const word2 = getRandomWord();
  const word3 = getRandomWord();

  return `${word1}-${word2}-${word3}`;
};
