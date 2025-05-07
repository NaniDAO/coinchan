/* --------------------------------------------------------------------------
   TokenSelectorFast  –  ultra‑light virtualised token dropdown
   -------------------------------------------------------------------------- */

   import { memo, useCallback, useEffect } from "react";
   import { FixedSizeList as List, ListChildComponentProps } from "react-window";
   import { useInView } from "react-intersection-observer";
   import { formatEther } from "viem";
   
   /* ❗ adjust path if you move the file */
   import type { TokenMeta } from "@/hooks/use-tokens-fast";
   
   type Props = {
     tokens: TokenMeta[];
     selected: TokenMeta;
     onSelect: (t: TokenMeta) => void;
   
     /** lazily fetch balances for the IDs you pass in */
     patchBalances(ids: bigint[]): void;
   };
   
   /* ----------------------------- coloured fallback icon -------------------- */
   const Avatar = memo(({ symbol }: { symbol: string }) => {
     const colour =
       [
         "bg-red-500",
         "bg-emerald-600",
         "bg-indigo-500",
         "bg-amber-600",
         "bg-pink-600",
       ][symbol.charCodeAt(0) % 5];
   
     return (
       <span
         className={`w-6 h-6 mr-2 rounded-full ${colour} text-white flex items-center justify-center text-[10px]`}
       >
         {symbol.slice(0, 2).toUpperCase()}
       </span>
     );
   });
   Avatar.displayName = "Avatar";
   
   /* ---------------------------- main component ----------------------------- */
   export const TokenSelectorFast = memo<Props>(
     ({ tokens, selected, onSelect, patchBalances }) => {
       /* we memo‑ise the row renderer so react‑window can skip re‑renders */
       const Row = useCallback(
         ({ index, style }: ListChildComponentProps) => {
           const token = tokens[index];
           const { ref, inView } = useInView({ triggerOnce: true });
   
           /* when a row first scrolls into view => fetch its balances */
           useEffect(() => {
             if (inView && token.id !== null) patchBalances([token.id]);
           }, [inView, token.id]);
   
           return (
             <div
               ref={ref}
               style={style}
               onClick={() => onSelect(token)}
               className={`flex items-center justify-between px-3 py-2 cursor-pointer ${
                 token.id === selected.id ? "bg-yellow-100" : ""
               }`}
             >
               <div className="flex items-center">
                 <Avatar symbol={token.symbol} />
                 <span className="font-medium">{token.symbol}</span>
               </div>
   
               {/* right‑side value: ETH reserve for coins, balance for ETH */}
               {token.id === null ? (
                 <span className="text-xs">
                   {token.balance ? formatEther(token.balance).slice(0, 7) : "0"}
                 </span>
               ) : (
                 <span className="text-xs">
                   {token.reserve0
                     ? `${Number(formatEther(token.reserve0)).toFixed(2)} Ξ`
                     : "—"}
                 </span>
               )}
             </div>
           );
         },
         [tokens, selected, onSelect, patchBalances],
       );
   
       /* --------------------------- render list --------------------------- */
       return (
         <div className="w-64 h-72 border border-yellow-200 rounded-md overflow-hidden">
           <List
             height={288}          /* 72 px × 4 rows – tweak if you change itemSize */
             width="100%"
             itemCount={tokens.length}
             itemSize={40}        /* keep in sync with padding/margins above */
           >
             {Row}
           </List>
         </div>
       );
     },
   );
   
   TokenSelectorFast.displayName = "TokenSelectorFast";
   