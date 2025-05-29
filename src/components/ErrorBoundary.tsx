import React, { Component, ReactNode } from "react";

// Simple error boundary to prevent crashes
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Component Error:", error);
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
