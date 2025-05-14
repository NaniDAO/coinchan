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
