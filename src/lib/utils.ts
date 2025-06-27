import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function trunc(value: number | string, length: number = 3): string {
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
export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number for display in input fields with comma thousands separators
 * Handles integers without decimals for token amounts
 * @param value The number to format
 * @returns Formatted string with commas, no decimals for integers
 */
export function formatNumberInput(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
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
  return parseFloat(cleaned);
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
    const context = this;

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(context, args);
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
