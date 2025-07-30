import { formatImageURL } from "@/hooks/metadata";
import { getRandomDiamondColor } from "@/lib/color";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Skeleton } from "./ui/skeleton";

interface SaleBlurbProps {
  coinId: string;
}

const INDEXER_URL = import.meta.env.VITE_INDEXER_URL;

const GET_ZCURVE_SALE = `
  query GetZCurveSale($coinId: BigInt!) {
    zcurveSale(coinId: $coinId) {
      blockNumber
      coinId
      createdAt
      creator
      currentPrice
      deadline
      divisor
      ethEscrow
      ethTarget
      feeOrHook
      lpSupply
      netSold
      percentFunded
      quadCap
      saleCap
      status
      coin {
        imageUrl
        name
        symbol
        description
      }
    }
  }
`;

const useSale = (coinId: string) => {
  return useQuery({
    queryKey: ["zCurve-sale", coinId],
    queryFn: async () => {
      const response = await fetch(INDEXER_URL + "/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: GET_ZCURVE_SALE,
          variables: { coinId },
        }),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(result.errors[0]?.message || "GraphQL error");
      }

      return result.data;
    },
  });
};

export const SaleBlurb: React.FC<SaleBlurbProps> = ({ coinId }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  // fetch details for stream
  const { data, isLoading } = useSale(coinId);

  const [imageUrl, farmColor, ticker, saleData, description] = useMemo(() => {
    if (!data?.zcurveSale?.coin?.symbol) return [undefined, undefined, undefined, undefined, undefined];

    const ticker = data.zcurveSale.coin.symbol;
    const farmColor = getRandomDiamondColor(ticker);
    const saleData = data.zcurveSale;

    if (!data?.zcurveSale?.coin?.imageUrl) return [undefined, farmColor, ticker, saleData];

    const imageUrl = formatImageURL(data.zcurveSale.coin.imageUrl);

    const description = data.zcurveSale.coin.description;
    return [imageUrl, farmColor, ticker, saleData, description];
  }, [data?.zcurveSale?.coin?.symbol, data?.zcurveSale?.coin?.imageUrl]);

  if (isLoading) {
    return (
      <div className="w-fit text-lg flex items-center">
        <span className="text-muted-foreground">└── </span>
        <Skeleton className="w-4 h-4 mr-2" />
        <Skeleton className="w-16 h-4 mr-2" />
        <Skeleton className="w-32 h-4" />
      </div>
    );
  }

  if (!farmColor || !ticker) return null;

  return (
    <div className="w-fit text-lg">
      <Link
        to={"/c/$coinId"}
        params={{
          coinId: coinId,
        }}
        className={"flex flex-row items-center hover:underline"}
      >
        <span className="text-muted-foreground">└── </span>
        <div className="relative w-4 h-4 mr-2">
          {!imageLoaded && <Skeleton className="w-4 h-4 absolute inset-0" />}
          <img
            src={imageUrl}
            alt={data?.zcurveSale?.coin?.name || ticker}
            className={`w-4 h-4 bg-white transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageLoaded(true)}
          />
        </div>
        <span className="font-bold" style={{ color: farmColor }}>
          {ticker.toUpperCase()}
        </span>
        <span className="truncate text-muted-foreground">-{description}</span>
        <span className="text-muted-foreground"> ({saleData?.percentFunded ? `${saleData.percentFunded}%` : ""})</span>
      </Link>
    </div>
  );
};
