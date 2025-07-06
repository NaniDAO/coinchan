import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

interface FarmErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface FarmErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{
    error?: Error;
    onRetry?: () => void;
  }>;
}

export class FarmErrorBoundary extends React.Component<FarmErrorBoundaryProps, FarmErrorBoundaryState> {
  constructor(props: FarmErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): FarmErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Farm Error Boundary caught an error:", error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error} onRetry={this.handleRetry} />;
      }

      return <FarmErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

interface FarmErrorFallbackProps {
  error?: Error;
  onRetry?: () => void;
}

function FarmErrorFallback({ error, onRetry }: FarmErrorFallbackProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full border-2 border-destructive/50 bg-destructive/10 p-4 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-4 border-2 border-destructive bg-destructive/20 rounded-full flex items-center justify-center">
          <span className="text-destructive text-xs font-bold">!</span>
        </div>
        <h3 className="font-mono font-bold text-destructive uppercase tracking-wide">[{t("common.error")}]</h3>
      </div>

      <p className="text-sm text-destructive/80 mb-4 font-mono">{error?.message || t("common.something_went_wrong")}</p>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={onRetry}
          variant="outline"
          size="sm"
          className="font-mono font-bold uppercase tracking-wide border-destructive text-destructive hover:bg-destructive/10"
        >
          [{t("common.retry")}]
        </Button>

        <Button
          onClick={() => window.location.reload()}
          variant="outline"
          size="sm"
          className="font-mono font-bold uppercase tracking-wide"
        >
          [{t("common.reload_page")}]
        </Button>
      </div>

      {process.env.NODE_ENV === "development" && error && (
        <details className="mt-4 text-xs">
          <summary className="cursor-pointer font-mono text-muted-foreground">[Debug Info]</summary>
          <pre className="mt-2 p-2 bg-muted rounded text-muted-foreground overflow-auto">{error.stack}</pre>
        </details>
      )}
    </div>
  );
}
