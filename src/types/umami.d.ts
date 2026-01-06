/**
 * TypeScript declarations for Umami Analytics
 */

interface UmamiTracker {
  /**
   * Track a custom event
   * @param eventName - Name of the event (e.g., 'swap-completed')
   * @param eventData - Optional event properties
   */
  track: (eventName: string, eventData?: Record<string, any>) => void;
}

interface Window {
  /**
   * Umami analytics instance
   * Automatically available when Umami script is loaded
   */
  umami?: UmamiTracker;
}
