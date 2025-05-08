import { useEffect } from 'react';

/**
 * Simplified error handler that just logs connection errors
 * without attempting to modify wallet behavior
 */
export function ConnectionErrorHandler() {
  // Set up global error handler to catch unhandled errors
  useEffect(() => {
    const originalOnError = window.onerror;
    
    const handleError = (event: ErrorEvent) => {
      const errorMsg = event.error?.message || event.message;
      
      if (typeof errorMsg === 'string' && 
          (errorMsg.includes('getChainId is not a function') || 
           errorMsg.includes('connector.getChainId') ||
           errorMsg.includes('connections.get is not a function'))) {
        
        // Just log the error without taking action
        console.warn('Wallet connection warning suppressed:', errorMsg);
        
        // Prevent the default error handling to avoid console spam
        event.preventDefault();
        
        // Return true to indicate we've handled this error
        return true;
      }
      
      // For other errors, use the original handler
      return originalOnError ? originalOnError.call(window, event.message, event.filename, event.lineno, event.colno, event.error) : false;
    };
    
    // Add our custom error handler
    window.addEventListener('error', handleError as EventListener);
    
    return () => {
      // Clean up by removing our handler
      window.removeEventListener('error', handleError as EventListener);
    };
  }, []);
  
  // This component doesn't render anything
  return null;
}

export default ConnectionErrorHandler;