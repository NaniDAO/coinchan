import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the predict page to handle wallet connection errors gracefully
 */
export class PredictErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // Check if it's a connector error
    const isConnectorError =
      error.message.includes("getChainId is not a function") ||
      error.message.includes("connector") ||
      error.message.includes("connection");

    if (isConnectorError) {
      console.warn("Wallet connector error caught by boundary:", error);
    }

    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error boundary caught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // Force a page reload to reset all state
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Check if it's a connector error
      const isConnectorError =
        this.state.error?.message.includes("getChainId") ||
        this.state.error?.message.includes("connector") ||
        this.state.error?.message.includes("connection");

      if (isConnectorError) {
        // Show wallet-specific error UI
        return (
          <div className="mx-auto max-w-2xl p-8">
            <div className="bg-card border border-border rounded-xl p-8 text-center space-y-6">
              <div className="flex justify-center">
                <div className="rounded-full bg-yellow-500/10 p-4">
                  <AlertTriangle className="h-8 w-8 text-yellow-500" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold">Wallet Connection Issue</h2>
                <p className="text-muted-foreground">
                  There was a problem with your wallet connection. This usually happens when the wallet extension is
                  restarted or updated.
                </p>
              </div>
              <div className="space-y-3">
                <Button onClick={this.handleReset} className="w-full" size="lg">
                  Refresh Page
                </Button>
                <p className="text-xs text-muted-foreground">
                  After refreshing, you may need to reconnect your wallet.
                </p>
              </div>
            </div>
          </div>
        );
      }

      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Generic error UI
      return (
        <div className="mx-auto max-w-2xl p-8">
          <div className="bg-card border border-border rounded-xl p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-red-500/10 p-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold">Something went wrong</h2>
              <p className="text-muted-foreground">
                An unexpected error occurred. Please try refreshing the page.
              </p>
            </div>
            <Button onClick={this.handleReset} className="w-full" size="lg">
              Refresh Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
