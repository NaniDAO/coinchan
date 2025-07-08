import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

const useApy = (poolId?: string) => {
  const { data } = useQuery({
    queryKey: ["pool-apy", poolId],
    queryFn: async () => {
      const response = await fetch(
        `${import.meta.env.VITE_INDEXER_URL}/api/pool-apr?poolId=${poolId}`,
      );
      const data = await response.json();
      return data.apy;
    },
    enabled: !!poolId,
  });
  return { data };
};

export const ApyDisplay = ({
  poolId,
  className,
}: {
  poolId?: string;
  className?: string;
}) => {
  const { data } = useApy(poolId);

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
