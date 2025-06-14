import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function trunc(value: number | string, length: number = 3): string {
  return (
    value.toString().slice(0, length) + "..." + value.toString().slice(-length)
  );
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
 * Create a debounced function that delays invoking the provided function
 * until after `wait` milliseconds have elapsed since the last invocation.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait = 300,
): (...args: Parameters<T>) => void {
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
