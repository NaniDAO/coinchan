import { useDAOTreasuryBalances } from "@/hooks/use-dao-treasury";
import { useDAORagequittable } from "@/hooks/use-dao-governance";
import { TREASURY_ASSETS } from "@/constants/ZammDAO";
import { formatUnits } from "viem";
import { LoadingLogo } from "@/components/ui/loading-logo";
import { Button } from "@/components/ui/button";

export const TreasuryView = () => {
  const { balances, isLoading } = useDAOTreasuryBalances();
  const { ragequittable } = useDAORagequittable();

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <LoadingLogo size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold border-b border-white/20 pb-3">
        Treasury Assets
      </h3>

      {/* Asset List */}
      <div className="space-y-3">
        {Object.entries(TREASURY_ASSETS).map(([key, asset]) => {
          const balance = balances[key as keyof typeof balances];
          const formattedBalance = formatUnits(balance, asset.decimals);
          const hasBalance = balance > 0n;

          return (
            <div
              key={key}
              className={`p-4 border rounded-lg transition-all ${
                hasBalance
                  ? "border-white/30 bg-white/5"
                  : "border-white/10 bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono font-semibold">{asset.symbol}</div>
                  <div className="text-xs text-white/60">{asset.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg">
                    {parseFloat(formattedBalance).toFixed(4)}
                  </div>
                  <div className="text-xs text-white/60">{asset.symbol}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-white/20">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => {
            // TODO: Open deposit modal
            console.log("Deposit modal");
          }}
        >
          Deposit to Treasury
        </Button>

        {ragequittable && (
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => {
              // TODO: Open ragequit modal
              console.log("Ragequit modal");
            }}
          >
            Ragequit
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-white/50 italic border-t border-white/10 pt-4">
        Treasury assets are managed by DAO governance through proposals.
        {ragequittable && " Members can ragequit to withdraw proportional assets."}
      </div>
    </div>
  );
};
