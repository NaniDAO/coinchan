import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDownIcon, SearchIcon } from "lucide-react";
import { formatEther, zeroAddress } from "viem";
import { cn } from "@/lib/utils";
import { PoolPlainRow } from "@/hooks/use-all-pools";
import { PoolTokenImage } from "./PoolTokenImage";

/* ---------- helpers ---------- */

const toBigIntSafe = (v?: string | null) => {
  try {
    return v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
};

const formatEth = (wei: bigint) => {
  const v = Number(formatEther(wei));
  if (v >= 10000) return `${Math.floor(v / 1000)}K ETH`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K ETH`;
  if (v >= 1) return `${v.toFixed(2)} ETH`;
  if (v >= 0.001) return `${v.toFixed(4)} ETH`;
  if (v > 0) return `${v.toFixed(6)} ETH`;
  return `No ETH`;
};

const formatFee = (swapFeeStr?: string) => {
  const pct = swapFeeStr ? Number(swapFeeStr) / 100 : 1; // matches your TokenSelector logic
  if (Number.isNaN(pct)) return "—";
  if (pct % 1 === 0) return `${pct.toFixed(0)}%`;
  if ((pct * 10) % 1 === 0) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
};

const getPoolKey = (p: PoolPlainRow) => `pool-${p.poolId ?? "0"}`;

/* ---------- component ---------- */

export const PoolSelector = memo(
  ({
    selectedPool,
    pools,
    onSelect,
    className,
    disabled,
  }: {
    selectedPool: PoolPlainRow | null;
    pools: PoolPlainRow[];
    onSelect: (pool: PoolPlainRow) => void;
    className?: string;
    disabled?: boolean;
  }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);

    // Sort by highest ETH reserves (unique by poolId)
    const sortedPools = useMemo(() => {
      const getEthReserve = (p: any): bigint => {
        const r0 = toBigIntSafe(p?.reserve0);
        const r1 = toBigIntSafe(p?.reserve1);
        const isETH0 =
          BigInt(p?.coin0?.id) === 0n && p?.coin0?.address === zeroAddress;
        const isETH1 =
          BigInt(p?.coin1?.id) === 0n && p?.coin1?.address === zeroAddress;
        if (isETH0) return r0;
        if (isETH1) return r1;
        return 0n; // neither side is ETH
      };

      const list = [...pools].filter((p) => p.poolId && getEthReserve(p) > 0n);

      list.sort((a, b) => {
        const A = getEthReserve(a);
        const B = getEthReserve(b);
        if (A === B) return 0;
        return A > B ? -1 : 1;
      });

      const seen = new Set<string>();
      return list.filter((p) => {
        const key = p.poolId ?? "";
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }, [pools]);

    const isDropdownDisabled = disabled || sortedPools.length <= 1;

    const handleSelect = (pool: PoolPlainRow) => {
      onSelect(pool);
      setIsOpen(false);
    };

    // Current display bits
    const selectedEthReserve = formatEth(toBigIntSafe(selectedPool?.reserve0));
    const selectedFee = formatFee(selectedPool?.swapFee);
    const selectedPairSymbol = `${selectedPool?.coin0?.symbol ?? "UNK"}/${selectedPool?.coin1?.symbol ?? "UNK"}`;

    return (
      <div className="relative">
        {/* Selected pool display */}
        <div
          onClick={() => !isDropdownDisabled && setIsOpen(!isOpen)}
          className={cn(
            "z-10 hover:bg-muted flex items-center gap-2 px-2 py-1 touch-manipulation border border-border transition-colors",
            isDropdownDisabled ? "cursor-default" : "cursor-pointer",
            className,
          )}
        >
          {selectedPool && (
            <PoolTokenImage
              imageUrl0={selectedPool?.coin0?.imageUrl ?? null}
              imageUrl1={selectedPool?.coin1?.imageUrl ?? null}
            />
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-medium truncate">
                {selectedPairSymbol || "—"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="truncate">{selectedEthReserve}</span>
              <span>•</span>
              <span>{selectedFee}</span>
            </div>
          </div>
          {!isDropdownDisabled && <ChevronDownIcon className="w-4 h-4 ml-1" />}
        </div>

        {/* Dropdown */}
        {isOpen && !isDropdownDisabled && (
          <div className="absolute z-50 mt-1 w-[calc(100vw-40px)] sm:w-64 max-h-[60vh] sm:max-h-96 overflow-y-auto border-2 bg-background border-border">
            {/* Search */}
            <div className="sticky top-0 p-2 bg-muted border-b-2 border-border">
              <div className="relative">
                <input
                  type="text"
                  placeholder={t("tokenSelector.search_tokens")}
                  onChange={(e) => {
                    const query = e.target.value.toLowerCase();

                    const w = window as any;
                    if (w.poolSearchDebounce)
                      cancelAnimationFrame(w.poolSearchDebounce);

                    w.poolSearchDebounce = requestAnimationFrame(() => {
                      const visible = document.querySelectorAll(
                        "[data-pool-symbol]:not(.hidden)",
                      );
                      const all =
                        document.querySelectorAll("[data-pool-symbol]");

                      const itemsToSearch = visible.length > 0 ? visible : all;
                      const itemsArray = Array.from(itemsToSearch);
                      let anyVisible = false;

                      for (let i = 0; i < itemsArray.length; i++) {
                        const item = itemsArray[i] as HTMLElement;
                        const symbol =
                          item
                            .getAttribute("data-pool-symbol")
                            ?.toLowerCase() || "";
                        const name =
                          item.getAttribute("data-pool-name")?.toLowerCase() ||
                          "";
                        const id = item.getAttribute("data-pool-id") || "";

                        const queryIsNumber = !isNaN(Number(query));
                        const idMatches = queryIsNumber
                          ? id.startsWith(query)
                          : id.toLowerCase().includes(query);

                        if (
                          symbol.includes(query) ||
                          name.includes(query) ||
                          idMatches
                        ) {
                          item.classList.remove("hidden");
                          anyVisible = true;
                        } else {
                          item.classList.add("hidden");
                        }
                      }

                      // If nothing visible after incremental filter, run a full pass
                      if (!anyVisible && visible.length > 0) {
                        const allItemsArray = Array.from(all);
                        for (let i = 0; i < allItemsArray.length; i++) {
                          const item = allItemsArray[i] as HTMLElement;
                          const symbol =
                            item
                              .getAttribute("data-pool-symbol")
                              ?.toLowerCase() || "";
                          const name =
                            item
                              .getAttribute("data-pool-name")
                              ?.toLowerCase() || "";
                          const id = item.getAttribute("data-pool-id") || "";

                          const queryIsNumber = !isNaN(Number(query));
                          const idMatches = queryIsNumber
                            ? id.startsWith(query)
                            : id.toLowerCase().includes(query);

                          if (
                            symbol.includes(query) ||
                            name.includes(query) ||
                            idMatches
                          ) {
                            item.classList.remove("hidden");
                          } else {
                            item.classList.add("hidden");
                          }
                        }
                      }
                    });
                  }}
                  className="w-full pl-8 border-2 border-border p-2 bg-background"
                />
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            {/* List */}
            <div className="bg-background z-10 content-visibility-auto intrinsic-h-[5000px] contain-content">
              {sortedPools.map((pool) => {
                const poolIdStr = pool.poolId ?? "0";
                const isSelected = selectedPool?.poolId === pool.poolId;

                const ethReserve = formatEth(toBigIntSafe(pool.reserve0));
                const fee = formatFee(pool.swapFee);

                const pairSymbol = `${pool?.coin0?.symbol ?? "UNK"}/${pool?.coin1?.symbol ?? "UNK"}`;

                return (
                  <div
                    key={getPoolKey(pool)}
                    onClick={() => handleSelect(pool)}
                    data-pool-symbol={pairSymbol}
                    data-pool-name={pairSymbol}
                    data-pool-id={poolIdStr}
                    className={cn(
                      "flex items-center justify-between p-3 sm:p-2 cursor-pointer touch-manipulation transition-colors content-visibility-auto contain-[50px]",
                      isSelected ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <PoolTokenImage
                        imageUrl0={pool?.coin0?.imageUrl ?? null}
                        imageUrl1={pool?.coin1?.imageUrl ?? null}
                      />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium truncate">
                            {pairSymbol}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {ethReserve} • {fee}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {sortedPools.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  {t("common.no_lp_pools_available")}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    const sameSelection =
      prev.selectedPool?.poolId === next.selectedPool?.poolId;
    return (
      sameSelection &&
      prev.pools.length === next.pools.length &&
      prev.disabled === next.disabled &&
      prev.className === next.className
    );
  },
);
