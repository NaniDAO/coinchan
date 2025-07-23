// Removed unused React import
import { useTranslation } from "react-i18next";

export function FarmCardSkeleton() {
  return (
    <div className="w-full border-2 border-primary/30 bg-card animate-pulse">
      <div className="p-3 border-b border-primary/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-muted-foreground/20" />
            <div className="h-4 w-24 bg-muted-foreground/20 rounded" />
          </div>
          <div className="h-6 w-16 bg-muted-foreground/20 rounded" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
          <div className="w-4 h-4 rounded-full bg-muted-foreground/20" />
          <div className="h-3 w-16 bg-muted-foreground/20 rounded" />
        </div>
      </div>

      <div className="p-3 space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between">
            <div className="h-3 w-24 bg-muted-foreground/20 rounded" />
            <div className="h-3 w-32 bg-muted-foreground/20 rounded" />
          </div>
          <div className="w-full h-2 bg-muted-foreground/20 rounded" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          <div>
            <div className="h-3 w-20 bg-muted-foreground/20 rounded mb-1" />
            <div className="h-3 w-16 bg-muted-foreground/20 rounded" />
          </div>
          <div>
            <div className="h-3 w-24 bg-muted-foreground/20 rounded mb-1" />
            <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
          <div>
            <div className="h-3 w-20 bg-muted-foreground/20 rounded mb-1" />
            <div className="h-3 w-16 bg-muted-foreground/20 rounded" />
          </div>
          <div>
            <div className="h-3 w-12 bg-muted-foreground/20 rounded mb-1" />
            <div className="h-3 w-20 bg-muted-foreground/20 rounded" />
          </div>
        </div>

        <div className="h-8 w-full bg-muted-foreground/20 rounded" />
      </div>
    </div>
  );
}

export function FarmGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <FarmCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function FarmPositionSkeleton() {
  return (
    <div className="bg-card text-card-foreground border-2 border-border">
      <div className="p-4 border-b border-border animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-muted rounded" />
            <div className="h-4 w-24 bg-muted rounded" />
          </div>
          <div className="h-6 w-16 bg-muted rounded" />
        </div>
        <div className="mt-3 h-6 w-40 bg-muted rounded" />
      </div>
      <div className="p-4 space-y-4 animate-pulse">
        <div className="space-y-2">
          <div className="flex justify-between">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-4 w-20 bg-muted rounded" />
          </div>
          <div className="h-2 bg-muted rounded" />
        </div>
        <div className="h-12 bg-muted rounded" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="h-16 bg-muted rounded" />
          <div className="h-16 bg-muted rounded" />
          <div className="h-16 bg-muted rounded" />
        </div>
        <div className="h-10 bg-muted rounded" />
      </div>
      <div className="p-4 sm:p-6 space-y-3">
        <div className="p-3 border border-muted bg-background">
          <div className="h-4 w-full bg-muted rounded" />
        </div>
        <div className="p-3 border border-green-700/20 bg-background">
          <div className="h-4 w-full bg-muted rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
          <div className="h-10 bg-muted rounded" />
        </div>
      </div>
    </div>
  );
}

export function FarmTransactionLoading({ operation }: { operation: string }) {
  const { t } = useTranslation();

  return (
    <div className="w-full border-2 border-primary bg-primary/10 p-4 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="flex-1">
          <h3 className="font-mono font-bold text-sm uppercase tracking-wide">[{t("common.processing")}]</h3>
          <p className="text-xs text-muted-foreground font-mono mt-1">{operation}...</p>
        </div>
      </div>
    </div>
  );
}

export function FarmOperationPending({
  operation,
  txHash,
}: {
  operation: string;
  txHash?: `0x${string}`;
}) {
  const { t } = useTranslation();

  return (
    <div className="w-full border-2 border-yellow-500 bg-yellow-500/10 p-4 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
        <div className="flex-1">
          <h3 className="font-mono font-bold text-sm uppercase tracking-wide text-yellow-700 dark:text-yellow-300">
            [{t("common.pending")}]
          </h3>
          <p className="text-xs text-muted-foreground font-mono mt-1">{operation}</p>
          {txHash && (
            <p className="text-xs font-mono mt-2 break-all">
              <span className="text-muted-foreground">tx: </span>
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function FarmZapCalculationLoading() {
  const { t } = useTranslation();

  return (
    <div className="w-full border border-primary/30 bg-muted/20 p-3 rounded">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-muted-foreground">{t("common.calculating_zap")}...</span>
      </div>
    </div>
  );
}

export function FarmSuccessMessage({
  operation,
  txHash,
}: {
  operation: string;
  txHash?: `0x${string}`;
}) {
  const { t } = useTranslation();

  return (
    <div className="w-full border-2 border-green-500 bg-green-500/10 p-4 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-green-500 rounded-full flex items-center justify-center">
          <span className="text-green-500 text-sm">✓</span>
        </div>
        <div className="flex-1">
          <h3 className="font-mono font-bold text-sm uppercase tracking-wide text-green-700 dark:text-green-300">
            [{t("common.success")}]
          </h3>
          <p className="text-xs text-muted-foreground font-mono mt-1">{operation}</p>
          {txHash && (
            <p className="text-xs font-mono mt-2 break-all">
              <span className="text-muted-foreground">tx: </span>
              <a
                href={`https://etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)}
              </a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
