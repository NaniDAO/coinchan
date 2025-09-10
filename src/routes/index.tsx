import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LandingPage } from "@/components/LandingPage";
import { InstantSwapAction } from "@/components/swap/InstantSwapAction";
import { InstantTradeAction } from "@/components/trade/InstantTradeAction";
import { TokenSelectionProvider } from "@/contexts/TokenSelectionContext";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const handleEnterApp = () => {
    navigate({ to: "/swap" });
  };

  return (
    <div className="lg:pl-8 p-4">
      <TokenSelectionProvider>
        <div className="w-full !mb-10 mt-5 mx-auto !p-4 bg-background lg:max-w-2xl">
          <ErrorBoundary fallback={<div>Error</div>}>
            <InstantSwapAction hidePriceChart />
          </ErrorBoundary>
        </div>
      </TokenSelectionProvider>
      <div className="w-full !mb-10 mt-5 mx-auto !p-4 bg-background lg:max-w-2xl">
        <ErrorBoundary fallback={<div>Error in InstantTradeAction</div>}>
          <InstantTradeAction />
        </ErrorBoundary>
      </div>

      <LandingPage onEnterApp={handleEnterApp} />
    </div>
  );
}
