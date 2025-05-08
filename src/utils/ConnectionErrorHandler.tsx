import { useEffect } from 'react';

/**
 * Simplified error handler that just logs connection errors
 * without attempting to modify wallet behavior
 */
export function ConnectionErrorHandler() {
  // Only handle a limited set of errors and with minimal processing
  useEffect(() => {
    // We'll limit our error handling to just the essential connection errors
    const errorPatterns = [
      'getChainId is not a function',
      'connector.getChainId',
      'connections.get is not a function'
    ];
    
    // Create a simple throttled error handler to minimize performance impact
    let lastErrorTime = 0;
    let handlingError = false;
    
    // Use a properly typed event handler for 'error' events
    const handleError = (event: Event) => {
      // Early return if we're actively handling an error or throttling
      if (handlingError) return false;
      
      // Type guard to ensure we're dealing with an ErrorEvent
      if (!(event instanceof ErrorEvent)) return false;
      
      const now = Date.now();
      // Only process one error every 2 seconds maximum
      if (now - lastErrorTime < 2000) return false;
      
      const errorMsg = event.error?.message || event.message;
      if (!errorMsg || typeof errorMsg !== 'string') return false;
      
      // Check if this is one of our targeted errors
      const isConnectionError = errorPatterns.some(pattern => errorMsg.includes(pattern));
      
      if (isConnectionError) {
        handlingError = true;
        lastErrorTime = now;
        
        // Just suppress the error without any additional processing
        event.preventDefault();
        
        // Reset the handling flag after a short delay
        setTimeout(() => {
          handlingError = false;
        }, 50);
      }
      
      return false; // Standard return for EventListener
    };
    
    // Add our custom error handler with proper typing
    window.addEventListener('error', handleError);
    
    return () => {
      // Clean up by removing our handler
      window.removeEventListener('error', handleError);
    };
  }, []);
  
  // This component doesn't render anything
  return null;
}

export default ConnectionErrorHandler;