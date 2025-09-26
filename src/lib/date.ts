/**
 * Formats a Unix timestamp into a human-readable relative time string.
 * @param timestamp Unix timestamp in seconds or milliseconds
 * @returns Formatted string like "1d 5h ago" or "3mo 8d ago"
 */
export function formatTimeAgo(timestamp: number): string {
  // Convert to milliseconds if timestamp is in seconds
  const timeMs = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
  const now = Date.now();
  const diffMs = now - timeMs;

  // Calculate time units
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  // Format the output
  if (years > 0) {
    const remainingMonths = Math.floor((days % 365) / 30);
    return remainingMonths > 0
      ? `${years}y ${remainingMonths}mo ago`
      : `${years}y ago`;
  } else if (months > 0) {
    const remainingDays = days % 30;
    return remainingDays > 0
      ? `${months}mo ${remainingDays}d ago`
      : `${months}mo ago`;
  } else if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0
      ? `${days}d ${remainingHours}h ago`
      : `${days}d ago`;
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m ago`
      : `${hours}h ago`;
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s ago`
      : `${minutes}m ago`;
  } else {
    return `${seconds}s ago`;
  }
}

/**
 * Converts a number of seconds into a human-readable duration string.
 * Examples:
 *   45 -> "45s"
 *   3600 -> "1h"
 *   90061 -> "1d 1h 1m"
 *   2678400 -> "1mo"
 *   31556952 -> "1y"
 *
 * @param seconds Number of seconds
 * @returns Human-readable duration string
 */
export function formatDuration(seconds: number): string {
  const units = [
    { label: "y", value: 60 * 60 * 24 * 365 }, // years
    { label: "mo", value: 60 * 60 * 24 * 30 }, // months (approx.)
    { label: "w", value: 60 * 60 * 24 * 7 }, // weeks
    { label: "d", value: 60 * 60 * 24 }, // days
    { label: "h", value: 60 * 60 }, // hours
    { label: "m", value: 60 }, // minutes
    { label: "s", value: 1 }, // seconds
  ];

  let remaining = Math.max(seconds, 0);
  const parts: string[] = [];

  for (const unit of units) {
    if (remaining >= unit.value) {
      const count = Math.floor(remaining / unit.value);
      remaining %= unit.value;
      parts.push(`${count}${unit.label}`);
    }
    if (parts.length >= 2) break; // limit to two largest units for readability
  }

  return parts.length > 0 ? parts.join(" ") : "0s";
}
