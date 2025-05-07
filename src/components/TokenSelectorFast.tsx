import React, { memo, useEffect } from "react";
import { FixedSizeList as List, ListChildComponentProps } from "react-window";
import { useInView } from "react-intersection-observer";
import { formatEther } from "viem";
import { TokenMeta } from "@/hooks/useTokensFast";

/* Quick coloured fallback icon */
const Avatar = ({ symbol }: { symbol: string }) => {
  const col = [
    "bg-red-500",
    "bg-emerald-600",
    "bg-indigo-500",
    "bg-amber-600",
    "bg-pink-600",
  ][symbol.charCodeAt(0) % 5];
  return (
    <span
      className={`w-6 h-6 mr-2 rounded-full ${col} text-white flex items-center justify-center text-[10px]`}
    >
      {symbol.slice(0, 2).toUpperCase()}
    </span>
  );
};

interface Props {
  tokens: TokenMeta[];
  selected: TokenMeta;
  onSelect: (t: TokenMeta) => void;
  patchBalances(ids: bigint[]): void;
}

export const TokenSelectorFast = memo<Props>(
  ({ tokens, selected, onSelect, patchBalances }) => {
    /* row renderer ----------------------------------------------------- */
    const Row = ({ index, style }: ListChildComponentProps) => {
      const token = tokens[index];
      const { ref, inView } = useInView({ triggerOnce: true });

      /* when row is first visible → fetch its balances */
      useEffect(() => {
        if (!inView || token.id === null) return;
        patchBalances([token.id]);
      }, [inView]);

      return (
        <div
          ref={ref}
          style={style}
          className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
            token.id === selected.id ? "bg-yellow-100" : ""
          }`}
          onClick={() => onSelect(token)}
        >
          <div className="flex items-center">
            <Avatar symbol={token.symbol} />
            <span className="font-medium">{token.symbol}</span>
          </div>
          {token.id === null ? (
            <span className="text-xs">
              {token.balance ? formatEther(token.balance).slice(0, 7) : "0"}
            </span>
          ) : (
            <span className="text-xs">
              {token.reserve0
                ? Number(formatEther(token.reserve0)).toFixed(2) + " Ξ"
                : "—"}
            </span>
          )}
        </div>
      );
    };

    /* main dropdown container ----------------------------------------- */
    return (
      <div className="w-64 h-72 border border-yellow-200 rounded-md overflow-hidden">
        <List
          height={288}
          itemCount={tokens.length}
          itemSize={40}
          width="100%"
        >
          {Row}
        </List>
      </div>
    );
  },
);
