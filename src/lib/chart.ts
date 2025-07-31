import { BarPrice } from "lightweight-charts";

// Utility function to format numbers with subscript zeros
export const formatWithSubscriptZeros = (value: BarPrice): string => {
  if (value === 0) return "0";

  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  // Handle numbers >= 1
  if (absValue >= 1) {
    return sign + absValue.toFixed(4).replace(/\.?0+$/, "");
  }

  // Handle numbers >= 0.01 (show normally for readability)
  if (absValue >= 0.01) {
    return sign + absValue.toFixed(6).replace(/\.?0+$/, "");
  }

  // For very small numbers, use toFixed to avoid exponential notation
  const fixedStr = absValue.toFixed(20); // Use high precision to capture all digits
  const decimalIndex = fixedStr.indexOf(".");

  if (decimalIndex === -1) return sign + fixedStr;

  const afterDecimal = fixedStr.substring(decimalIndex + 1);
  let zeroCount = 0;

  // Count leading zeros after decimal
  for (let i = 0; i < afterDecimal.length; i++) {
    if (afterDecimal[i] === "0") {
      zeroCount++;
    } else {
      break;
    }
  }

  // If no leading zeros, format normally
  if (zeroCount === 0) {
    return sign + absValue.toFixed(6).replace(/\.?0+$/, "");
  }

  // Get significant digits after the leading zeros
  const significantDigits = afterDecimal.substring(zeroCount);

  // Take first 4-6 significant digits and remove trailing zeros
  const trimmedDigits = significantDigits.substring(0, 6).replace(/0+$/, "");

  if (trimmedDigits.length === 0) return "0";

  // Create subscript number - Unicode subscript characters
  const subscriptMap: { [key: string]: string } = {
    "0": "₀",
    "1": "₁",
    "2": "₂",
    "3": "₃",
    "4": "₄",
    "5": "₅",
    "6": "₆",
    "7": "₇",
    "8": "₈",
    "9": "₉",
  };

  const subscriptZeros = zeroCount
    .toString()
    .split("")
    .map((digit) => subscriptMap[digit])
    .join("");

  return `${sign}0.0${subscriptZeros}${trimmedDigits}`;
};
