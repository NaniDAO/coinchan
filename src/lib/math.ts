export const formatDexscreenerStyle = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const num = Math.abs(n);

  // Split into integer & decimal parts, trimming trailing zeros from decimal
  let [intPart, decPart = ""] = num.toFixed(20).split(".");
  decPart = decPart.replace(/0+$/, "");

  // No decimal part or >=1 just return normal toFixed(3)
  if (!decPart || num >= 1) return `${sign}${num.toFixed(3)}`;

  // First decimal digit shown normally
  const firstDec = decPart[0];

  // Count consecutive zeros *after* the first decimal digit
  let zeroCount = 0;
  for (let i = 1; i < decPart.length && decPart[i] === "0"; i++) {
    zeroCount++;
  }

  const nextDigit = decPart[1 + zeroCount];

  // Convert number to subscript characters
  const toSubscript = (val: number) =>
    String(val).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[+d]);

  // Only compress if there are at least 3 zeros after the first decimal digit
  if (zeroCount >= 3 && nextDigit) {
    return `${sign}${intPart}.${firstDec}${toSubscript(zeroCount)}${nextDigit}`;
  }

  // Otherwise just show with 3 decimal places
  return `${sign}${num.toFixed(3)}`;
};

export function formatPrice(n?: number) {
  if (n == null || !isFinite(n)) return "-";
  const abs = Math.abs(n);

  // Choose decimals based on magnitude
  if (abs >= 1)
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (abs >= 1e-6)
    return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  if (abs >= 1e-12)
    return n.toLocaleString(undefined, { maximumFractionDigits: 12 });

  return n.toExponential(2);
}

export const amountInWords = (amount?: number): string => {
  if (amount === undefined || amount === null || Number.isNaN(amount))
    return "";
  if (!Number.isFinite(amount)) return "";

  // Handle negatives
  if (amount < 0) return `negative ${amountInWords(Math.abs(amount))}`;

  // Only integer words per your examples
  const n = Math.trunc(amount);
  if (n === 0) return "zero";

  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
  ];

  const teens = [
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];

  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];

  const scales = [
    "",
    "thousand",
    "million",
    "billion",
    "trillion",
    // add more if you need: "quadrillion", "quintillion", ...
  ];

  // Convert 0..999 to words
  const chunkToWords = (num: number): string => {
    const parts: string[] = [];
    const hundred = Math.floor(num / 100);
    const rem = num % 100;

    if (hundred > 0) {
      parts.push(`${ones[hundred]} hundred`);
    }

    if (rem > 0) {
      if (rem < 10) {
        parts.push(ones[rem]);
      } else if (rem < 20) {
        parts.push(teens[rem - 10]);
      } else {
        const t = Math.floor(rem / 10);
        const o = rem % 10;
        if (o > 0) {
          // Hyphenate 21-99 non-multiples of ten
          parts.push(`${tens[t]}-${ones[o]}`);
        } else {
          parts.push(tens[t]);
        }
      }
    }

    return parts.join(" ");
  };

  // Break number into 3-digit chunks
  const chunks: number[] = [];
  let remaining = n;

  while (remaining > 0) {
    chunks.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const words: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk === 0) continue;

    const chunkWords = chunkToWords(chunk);
    const scale = scales[i];
    words.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
  }

  return words.join(" ");
};

export const shortenUint = (v: bigint, { max = 18 } = {}) => {
  const s = v.toString();
  if (s.length <= max) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
};

export const formatUsdPrice = (price: number): string => {
  if (price === 0) return "$0.00";
  if (price < 0.00000001) {
    // For extremely small values, use scientific notation
    return `$${price.toExponential(2)}`;
  }
  if (price < 0.000001) {
    // For very small values, show up to 10 decimal places
    const formatted = price.toFixed(10);
    // Remove trailing zeros
    return `$${formatted.replace(/\.?0+$/, "")}`;
  }
  if (price < 0.01) {
    return `$${price.toFixed(6)}`;
  }
  if (price < 1) {
    return `$${price.toFixed(4)}`;
  }
  return `$${price.toFixed(2)}`;
};
