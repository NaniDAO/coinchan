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
  const toSubscript = (val: number) => String(val).replace(/\d/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[+d]);

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
  if (abs >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  if (abs >= 1e-6) return n.toLocaleString(undefined, { maximumFractionDigits: 8 });
  if (abs >= 1e-12) return n.toLocaleString(undefined, { maximumFractionDigits: 12 });

  return n.toExponential(2);
}
