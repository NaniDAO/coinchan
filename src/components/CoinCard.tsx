import { CoinData, formatImageURL } from "@/hooks/metadata";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon } from "lucide-react";

interface CoinCardProps {
  coin: CoinData;
}

export function CoinCard({ coin }: CoinCardProps) {
  const { name, symbol, imageUrl, coinId } = coin;
  const displayName = name || `Token ${coinId.toString()}`;
  const displaySymbol = symbol || "TKN";
  const src = imageUrl ? formatImageURL(imageUrl) : "/placeholder.svg";
  const colorClass = `bg-chart-${Number(coinId % 5n) + 1}`;

  return (
    <div className="flex flex-col items-center border rounded bg-card shadow hover:shadow-lg transition">
      <h3 className="truncate p-2 text-center font-bold text-sm">
        {displayName} [{displaySymbol}]
      </h3>

      <div className="relative w-20 h-20 p-1">
        <div
          className={`absolute inset-0 flex ${colorClass} text-white justify-center items-center rounded-full`}
        >
          {displaySymbol.slice(0, 3)}
        </div>

        <img
          src={src}
          alt={`${displaySymbol} logo`}
          loading="lazy"
          // onError just swaps the src at the DOM level—no React re-render required
          onError={(e) => {
            const img = e.currentTarget;
            img.onerror = null;
            img.src = "/placeholder.svg";
          }}
          className="absolute inset-0 w-full h-full rounded-full object-cover"
        />
      </div>

      <Link
        to="/c/$coinId"
        params={{ coinId: coinId.toString() }}
        className="flex w-full items-center justify-between bg-primary/10 px-3 py-1 text-sm font-bold hover:bg-primary/50 transition"
      >
        <span>Trade</span>
        <ArrowRightIcon size={16} />
      </Link>
    </div>
  );
}
