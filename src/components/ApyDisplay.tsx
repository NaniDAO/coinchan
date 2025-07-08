import { usePoolApy } from "@/hooks/use-pool-apy";
import { cn } from "@/lib/utils";

export const PoolApyDisplay = ({
  poolId,
  className,
}: {
  poolId?: string;
  className?: string;
}) => {
  const { data } = usePoolApy(poolId);

  if (!poolId) return null;
  if (!data) return null;
  if (Number(data.slice(0, -1)) === 0) return null;

  return (
    <div
      className={cn(
        "flex border-border border-2 px-1 font-black py-1 items-center text-primary-foreground bg-accent rounded-2xl",
        className,
      )}
    >
      <div className="text-center w-full text-sm">
        {"Get "}
        {data}
        {" APY"}
      </div>
    </div>
  );
};
