import { CoinForm } from "@/CoinForm";
import { createFileRoute } from "@tanstack/react-router";
import { Component, ErrorInfo, ReactNode } from "react";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
});

// Custom error boundary component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error in CoinForm component:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md m-4">
          <h2 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">
            Something went wrong with the Create Coin form:
          </h2>
          <p className="text-red-600 dark:text-red-400">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <button
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function RouteComponent() {
  return (
    <div className="flex items-center justify-center mt-5">
      <ErrorBoundary>
        <CoinForm />
      </ErrorBoundary>
    </div>
  );
}
