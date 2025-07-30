import { formatImageURL } from "@/hooks/metadata";
import { useCombinedApr } from "@/hooks/use-combined-apr";
import { useIncentiveStream } from "@/hooks/use-incentive-stream";
import { getRandomDiamondColor } from "@/lib/color";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

interface TrendingFarmProps {
  chefId: string;
  url: string;
  color?: string;
  imgUrl?: string;
}

export const TrendingFarm: React.FC<TrendingFarmProps> = ({ chefId, url, color, imgUrl }) => {
  // fetch details for stream
  const { data } = useIncentiveStream(chefId);
  const { totalApr } = useCombinedApr({
    stream: data?.stream,
    lpToken: data?.lpToken,
    enabled: false,
  });

  const [imageUrl, farmColor, ticker] = useMemo(() => {
    if (!data?.lpToken?.symbol) return [imgUrl, color, undefined];
    const ticker = data.lpToken.symbol;
    const farmColor = getRandomDiamondColor(ticker);
    if (!data?.lpToken?.imageUrl) return [imgUrl, farmColor, ticker];
    const imageUrl = imgUrl ?? formatImageURL(data?.lpToken?.imageUrl);
    return [imageUrl, farmColor, ticker];
  }, [data?.lpToken?.symbol, data?.lpToken?.imageUrl]);

  if (!farmColor || !ticker || !totalApr) return null;

  return (
    <div className="w-fit text-lg">
      <Link to={url} className={"flex flex-row items-center hover:underline"}>
        <span className="text-muted-foreground">└── </span>
        <img src={imageUrl} alt={data?.lpToken?.symbol} className="w-4 h-4 mr-2 bg-white" />
        <span className="font-bold" style={{ color: farmColor }}>
          {ticker.toUpperCase()}
        </span>
        <span className="text-muted-foreground"> ({totalApr.toFixed(2)}%)</span>
      </Link>
    </div>
  );
};
