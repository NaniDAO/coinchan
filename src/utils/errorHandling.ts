/**
 * Utility functions for error handling in the application
 */

/**
 * Checks if an error is a user rejection error from wallet interactions
 * This covers various wallet providers including MetaMask, Coinbase Wallet, and others
 */
export const isUserRejectionError = (error: unknown): boolean => {
  if (!error) return false;

  // Convert error to string to check for common wallet rejection patterns
  const errorMessage = String(error).toLowerCase();

  // Common user rejection error patterns
  const rejectionPatterns = [
    "user rejected",
    "user denied",
    "user cancelled",
    "user canceled",
    "rejected by user",
    "denied by user",
    "declined by user",
    "rejected transaction",
    "transaction was rejected",
    "user declined",
    "rejected request",
    "request rejected",
    "action-rejected",
    "user disapproved",
    "user refused",
  ];

  // Check if error message contains any of the rejection patterns
  return rejectionPatterns.some((pattern) => errorMessage.includes(pattern));
};

/**
 * Handles errors from wallet interactions
 * If it's a user rejection error, it silently ignores it
 * Otherwise, it logs the error and optionally returns a user-friendly message
 */
export const handleWalletError = (
  error: unknown,
  options: {
    silent?: boolean; // If true, no console log for any error
    logRejections?: boolean; // If true, log user rejections (default false)
  } = {},
): string | null => {
  const { silent = false, logRejections = false } = options;

  // If it's a user rejection, handle quietly
  if (isUserRejectionError(error)) {
    // Only log user rejections if specifically requested
    if (logRejections && !silent) {
      console.log("User rejected wallet request");
    }
    return null;
  }

  // For other errors, log and return message
  if (!silent) {
    console.error("Wallet error:", error);
  }

  // Return a generic error message for non-rejection errors
  return "Transaction failed. Please try again.";
};
