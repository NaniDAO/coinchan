/**
 * Utility functions for safely handling BigInt values in logging and serialization
 */

/**
 * Safely log objects that may contain BigInt values
 * Converts BigInt to strings to avoid JSON serialization errors
 */
export function logSafely(label: string, data: any): void {
  try {
    const safeData = JSON.stringify(data, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
    console.log(label, JSON.parse(safeData));
  } catch (error) {
    // Fallback to basic logging if JSON serialization fails
    console.log(label, "[Complex object with BigInt values]", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Convert BigInt values in an object to strings for safe serialization
 * Useful for preparing data for APIs or storage
 */
export function bigIntToString(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(bigIntToString);
  }

  if (typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = bigIntToString(value);
    }
    return result;
  }

  return obj;
}

/**
 * Create a BigInt-safe replacer function for JSON.stringify
 */
export function createBigIntReplacer() {
  return (_key: string, value: any) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  };
}

/**
 * Safely stringify an object that may contain BigInt values
 */
export function stringifySafe(obj: any, space?: string | number): string {
  return JSON.stringify(obj, createBigIntReplacer(), space);
}
