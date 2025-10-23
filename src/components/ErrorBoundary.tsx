import type React from "react";
import { Component, type ReactNode } from "react";

// Simple error boundary to prevent crashes
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey?: string | number },
  { hasError: boolean; errorKey?: string | number }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode; resetKey?: string | number }) {
    super(props);
    this.state = { hasError: false, errorKey: props.resetKey };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  // Reset error state when resetKey changes (e.g., on navigation)
  static getDerivedStateFromProps(
    props: { resetKey?: string | number },
    state: { hasError: boolean; errorKey?: string | number },
  ) {
    if (props.resetKey !== state.errorKey) {
      return { hasError: false, errorKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error) {
    // Suppress logging for transient router errors that resolve quickly
    const isTransientRouterError =
      error.message?.includes("Could not find an active match") || error.message?.includes("Invariant failed");

    if (!isTransientRouterError) {
      console.error("Component Error:", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  errorMessage?: string;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ errorMessage }) => {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      {errorMessage && <pre>{errorMessage}</pre>}
    </div>
  );
};

export default ErrorFallback;
