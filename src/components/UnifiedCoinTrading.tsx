import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { FinalizedPoolTrading } from "@/components/FinalizedPoolTrading";
import { useOTCSaleStatus } from "@/hooks/use-otc-sale-status";
import BuyOTC from "./ico/BuyZICO";

import { Address, zeroAddress } from "viem";
import { Link } from "@tanstack/react-router";
import { encodeTokenQ } from "@/lib/token-query";
import { CookbookAddress } from "@/constants/Cookbook";
import { TokenMetadata } from "@/lib/pools";
import ErrorFallback, { ErrorBoundary } from "./ErrorBoundary";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useAccount } from "wagmi";

interface UnifiedCoinTradingProps {
  coinId: string;
  token?: Address;
  coinName?: string;
  coinSymbol?: string;
  coinIcon?: string;
  poolId?: string;
  totalSupply?: bigint;
}

export function UnifiedCoinTrading({
  coinId,
  token,
  coinName,
  coinSymbol,
  coinIcon,
  poolId,
  totalSupply,
}: UnifiedCoinTradingProps) {
  const { t } = useTranslation();
  const { address } = useAccount();

  const { data: balance } = useTokenBalance({
    address: address,
    token: {
      address: token ?? CookbookAddress,
      id: BigInt(coinId),
    },
  });

  const coin: TokenMetadata | undefined = useMemo(() => {
    if (!coinId || !coinName || !coinSymbol || !coinIcon) return undefined;
    return {
      address: token ?? CookbookAddress,
      id: BigInt(coinId),
      name: coinName,
      symbol: coinSymbol,
      description: "Token on Sale",
      imageUrl: coinIcon,
      decimals: 18,
      standard: "ERC6909",
      balance: balance ?? 0n,
    };
  }, [coinId, token, coinName, coinSymbol, coinIcon, balance]);

  const { data: zICOsaleStatus } = useOTCSaleStatus({
    token: coin,
  });

  const computedPoolId = useMemo(() => {
    const pid = poolId?.toString().trim();
    if (!pid || pid === "0") return null;
    return pid;
  }, [poolId]);

  return (
    <div className="w-full">
      <div className="space-y-6">
        <ErrorBoundary fallback={<ErrorFallback errorMessage="Error loading Trading Panel"></ErrorFallback>}>
          {coin && zICOsaleStatus && zICOsaleStatus.zicoInventory > 0n ? (
            <BuyOTC buyToken={coin} sale={zICOsaleStatus} totalSupply={totalSupply} />
          ) : null}
        </ErrorBoundary>

        <ErrorBoundary fallback={<ErrorFallback errorMessage="Error loading Trading Panel"></ErrorFallback>}>
          {computedPoolId ? (
            <FinalizedPoolTrading
              coinId={coinId}
              contractAddress={token}
              coinName={coinName}
              coinSymbol={coinSymbol}
              coinIcon={coinIcon}
              poolId={computedPoolId}
              totalSupply={totalSupply}
            />
          ) : (
            <Alert>
              <AlertDescription className="flex flex-col gap-2">
                {t("trade.no_pool_yet", "No liquidity pool found for this token.")}
                <Link
                  to="/positions/create"
                  search={{
                    tokenB: encodeTokenQ({
                      address: token ?? CookbookAddress,
                      id: BigInt(coinId),
                    }),
                    tokenA: encodeTokenQ({
                      address: zeroAddress,
                      id: 0n,
                    }),
                    fee: "30",
                  }}
                  className="underline"
                >
                  {t("trade.add_liquidity", "Add liquidity")}
                </Link>
              </AlertDescription>
            </Alert>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
