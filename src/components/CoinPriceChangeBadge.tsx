import {
  EightBitHoverCard,
  EightBitHoverCardContent,
  EightBitHoverCardTrigger,
} from "@/components/ui/8bit/hover-card";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, TrendingUpDownIcon } from "lucide-react";
import { formatEther } from "viem";
import SpinnerLoader from "./ui/spinner-loader";

const usePriceChange = (coinId: string, interval: "1h" | "1d") => {
  return useQuery({
    queryKey: ["priceChange", coinId, interval],
    queryFn: async () => {
      const url = new URL(
        `${import.meta.env.VITE_INDEXER_URL}/api/price-change`,
      );
      url.searchParams.append("coinId", coinId.toString());
      url.searchParams.append("interval", interval);

      const result = await fetch(url);
      const data = await result.json();

      return data as {
        coinId: string;
        interval: string;
        percentChange: number;
        pastPrice: string;
        currentPrice: string;
      };
    },
  });
};

export const CoinPriceChangeBadge = ({ coinId }: { coinId: string }) => {
  const {
    data: data1h,
    isLoading: isLoading1h,
    isError: isError1h,
  } = usePriceChange(coinId, "1h");

  const {
    data: data1d,
    isLoading: isLoading1d,
    isError: isError1d,
  } = usePriceChange(coinId, "1d");

  if (isLoading1h || isLoading1d) return <SpinnerLoader />;

  if (isError1h || isError1d) {
    return null;
  }

  const formatPrice = (price: number | string | undefined) => {
    if (price === undefined) return "N/A";
    return Number(formatEther(BigInt(price))).toFixed(8);
  };

  return (
    <EightBitHoverCard>
      <EightBitHoverCardTrigger>
        <TrendingUpDownIcon size={16} />
      </EightBitHoverCardTrigger>
      <EightBitHoverCardContent className="min-w-fit">
        <div className="flex flex-col">
          {[
            {
              label: "1hr",
              data: data1h,
            },
            {
              label: "1d",
              data: data1d,
            },
          ].map(({ label, data }) => (
            <div
              key={label}
              className="grid grid-cols-[40px_60px_1fr] gap-2 items-center"
            >
              <h5 className="text-xs">{label}</h5>
              <span className="text-xs text-right font-medium">
                {data?.percentChange?.toFixed(2)}%
              </span>
              <div className="flex flex-row items-center text-xs">
                <span>{" [ "}</span>
                <span>{formatPrice(data?.pastPrice)}</span>
                <ArrowRightIcon size={12} className="mx-1" />
                <span>{formatPrice(data?.currentPrice)}</span>
                <span>{" ] "}</span>
              </div>
            </div>
          ))}
        </div>
      </EightBitHoverCardContent>
    </EightBitHoverCard>
  );
};
