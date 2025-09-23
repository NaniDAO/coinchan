import AiMetaCard from "@/components/AiMetaCard";
import { CoinBreadcrumb } from "@/components/CoinBreadcrumb";
import { CoinInfoCard } from "@/components/CoinInfoCard";
import ErrorFallback, { ErrorBoundary } from "@/components/ErrorBoundary";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { useCoinTotalSupply } from "@/hooks/use-coin-total-supply";
import { useETHPrice } from "@/hooks/use-eth-price";
import { useGetToken } from "@/hooks/use-get-token";
import { useReserves } from "@/hooks/use-reserves";
import { useZCurveSale } from "@/hooks/use-zcurve-sale";
import { Token, TokenMetadata, computePoolId } from "@/lib/pools";
import { ProtocolId, getSourceByContract } from "@/lib/protocol";
import { SWAP_FEE } from "@/lib/swap";
import { ZCURVE_STANDARD_PARAMS } from "@/lib/zCurveHelpers";
import { computeZCurvePoolId } from "@/lib/zCurvePoolId";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatEther, zeroAddress } from "viem";
import { VotePanel } from "../VotePanel";
import { PoolOverview } from "../PoolOverview";
import { UnifiedCoinTrading } from "../UnifiedCoinTrading";
import { WrapTokenManager } from "../WrapTokenManager";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { useAccount } from "wagmi";

export const TokenPage = ({ token }: { token: Token }) => {
  const { t } = useTranslation();

  const { data: tokenData } = useGetToken({ token });
  // Fetch coin metadata
  const { data: coinData, isLoading: isLoadingCoin } = useGetCoin({
    coinId: token.id.toString(),
    token: token.address,
  });
  const { address } = useAccount();
  const { data: balance } = useTokenBalance({
    address,
    token,
  });

  // Fetch ETH price for market cap calculation
  const { data: ethPriceData } = useETHPrice();
  // Check for zCurve sale
  const { data: zcurveSale } = useZCurveSale(token?.id?.toString());

  // Extract coin data
  const [
    name,
    symbol,
    imageUrl,
    description,
    tokenURI,
    poolIds,
    swapFees,
    totalSupply,
    tokenMetadata,
  ] = useMemo(() => {
    if (!coinData)
      return [
        tokenData?.name,
        tokenData?.symbol,
        tokenData?.imageUrl,
        undefined,
        undefined,
        undefined,
        [100n],
        undefined,
      ];
    const pools = coinData.pools.map((pool) => pool.poolId);
    const fees = coinData.pools.map((pool) => BigInt(pool.swapFee));

    const source = getSourceByContract(token.address);

    const tokenMetadata: TokenMetadata = {
      address: token.address,
      id: token.id,
      name: coinData.name,
      symbol: coinData.symbol,
      decimals: 18,
      imageUrl: coinData.imageUrl,
      description: coinData.description,
      standard: source === "ERC20" ? "ERC20" : "ERC6909",
      balance,
    };

    return [
      coinData?.name,
      coinData?.symbol,
      coinData?.imageUrl,
      coinData?.description,
      coinData?.tokenURI,
      pools,
      fees,
      coinData?.totalSupply,
      tokenMetadata,
      balance,
    ];
  }, [coinData]);

  // Determine pool ID first (needed for reserves)
  const poolId = useMemo(() => {
    if (zcurveSale) {
      const feeOrHook = BigInt(zcurveSale.feeOrHook || 30n);
      const actualFee = feeOrHook < 10000n ? feeOrHook : 30n;
      return BigInt(computeZCurvePoolId(token.id, actualFee));
    }
    const tokenA = {
      address: coinData?.pools?.[0]?.token0 ?? zeroAddress,
      id: coinData?.pools?.[0]?.coin0Id ?? 0n,
    };

    const tokenB = {
      address: coinData?.pools?.[0]?.token1 ?? zeroAddress,
      id: coinData?.pools?.[0]?.coin1Id ?? 0n,
    };

    return (
      poolIds?.[0] ||
      computePoolId(
        tokenA,
        tokenB,
        BigInt(
          coinData?.pools?.[0]?.feeOrHook ??
            coinData?.pools?.[0]?.swapFee ??
            SWAP_FEE,
        ),
        coinData?.pools?.[0]?.protocol as ProtocolId,
      )
    );
  }, [zcurveSale, token, poolIds, swapFees]);

  // Fetch pool reserves for finalized zCurve sales OR regular Cookbook coins
  const { data: reserves } = useReserves({
    poolId: poolId,
    source: coinData?.pools?.[0]?.protocol === "ZAMMV0" ? "ZAMM" : "COOKBOOK",
  });

  // Fetch total supply from holder balances as a fallback
  const { data: holdersTotalSupply } = useCoinTotalSupply(
    token?.id?.toString(),
    reserves,
  );

  // Get the most accurate total supply
  const actualTotalSupply = useMemo(() => {
    // If totalSupply from coinData is valid, use it
    if (totalSupply && totalSupply > 0n) {
      return totalSupply;
    }

    // Otherwise use holder-calculated supply
    if (holdersTotalSupply && holdersTotalSupply > 0n) {
      return holdersTotalSupply;
    }

    return null;
  }, [totalSupply, holdersTotalSupply]);

  // Calculate market cap based on phase
  const { marketCapEth, marketCapUsd, effectiveSwapFee, isZCurveBonding } =
    useMemo(() => {
      if (!ethPriceData) {
        return {
          marketCapEth: null,
          marketCapUsd: null,
          effectiveSwapFee: swapFees,
          isZCurveBonding: false,
        };
      }

      const ethPriceUsd = ethPriceData.priceUSD;

      if (isNaN(ethPriceUsd) || ethPriceUsd === 0) {
        return {
          marketCapEth: null,
          marketCapUsd: null,
          effectiveSwapFee: swapFees,
          isZCurveBonding: false,
        };
      }

      // Check if in active zCurve bonding phase
      if (zcurveSale && zcurveSale.status === "ACTIVE") {
        // During bonding curve phase - use hardcoded 1 billion total supply for zCurve tokens
        const totalSupply = ZCURVE_STANDARD_PARAMS.TOTAL_SUPPLY;

        // For market cap calculation during bonding curve, use a more intuitive approach:
        // Calculate based on what it would cost to buy the remaining supply at current prices

        const ethEscrow = BigInt(zcurveSale.ethEscrow || "0");
        const netSold = BigInt(zcurveSale.netSold || "0");
        const saleCap = BigInt(
          zcurveSale.saleCap || ZCURVE_STANDARD_PARAMS.SALE_CAP,
        );

        // First, try using the current marginal price if we have meaningful sales
        const currentPriceWei = BigInt(zcurveSale.currentPrice || "0");

        if (netSold > 0n && ethEscrow > 0n) {
          // Calculate average price paid so far
          const avgPriceWei = (ethEscrow * 10n ** 18n) / netSold;

          // For very early sales, use the average price as it's more representative
          // For later sales, we could use the marginal price
          // A good heuristic: if less than 1% sold, use average price
          const percentSold = (netSold * 100n) / saleCap;

          let effectivePriceWei: bigint;
          if (percentSold < 1n && avgPriceWei > 0n) {
            // Very early stage - use average price
            effectivePriceWei = avgPriceWei;
          } else if (currentPriceWei > 0n) {
            // Use current marginal price
            effectivePriceWei = currentPriceWei;
          } else {
            // Fallback to average
            effectivePriceWei = avgPriceWei;
          }

          // Calculate market cap using the effective price
          const marketCapWei = (totalSupply * effectivePriceWei) / 10n ** 18n;

          if (marketCapWei > 0n) {
            const impliedMarketCapEth = Number(formatEther(marketCapWei));

            return {
              marketCapEth: impliedMarketCapEth,
              marketCapUsd: impliedMarketCapEth * ethPriceUsd,
              effectiveSwapFee: [0n], // 0% during bonding
              isZCurveBonding: true,
            };
          }
        }

        // If we have a current price but no sales yet, use it
        if (currentPriceWei > 0n) {
          const marketCapWei = (totalSupply * currentPriceWei) / 10n ** 18n;
          if (marketCapWei > 0n) {
            const impliedMarketCapEth = Number(formatEther(marketCapWei));

            return {
              marketCapEth: impliedMarketCapEth,
              marketCapUsd: impliedMarketCapEth * ethPriceUsd,
              effectiveSwapFee: [0n], // 0% during bonding
              isZCurveBonding: true,
            };
          }
        }

        return {
          marketCapEth: 0,
          marketCapUsd: 0,
          effectiveSwapFee: [0n], // 0% during bonding
          isZCurveBonding: true,
        };
      }

      // For finalized AMM pools (including graduated zCurve)
      let actualSwapFee = swapFees;
      if (zcurveSale && zcurveSale.status === "FINALIZED") {
        // Extract the actual fee from feeOrHook (it's stored as basis points)
        const feeOrHook = BigInt(zcurveSale.feeOrHook);
        // Check if it's a simple fee (not a hook address)
        if (feeOrHook < 10000n) {
          actualSwapFee = [feeOrHook];
        } else {
          // Default to 30 bps if it's a hook
          actualSwapFee = [30n];
        }
      }

      // Calculate market cap from reserves if available (for finalized zCurve sales)
      if (
        zcurveSale &&
        zcurveSale.status === "FINALIZED" &&
        reserves &&
        reserves.reserve0 > 0n &&
        reserves.reserve1 > 0n
      ) {
        const ethReserve = Number(formatEther(reserves.reserve0));
        const tokenReserve = Number(formatEther(reserves.reserve1));
        const price = ethReserve / tokenReserve;
        // Use actual total supply from the indexer or holders (in wei, so format it)
        const supply = actualTotalSupply
          ? Number(formatEther(actualTotalSupply))
          : null;
        const marketCapEth = supply ? price * supply : null;
        const marketCapUsd = marketCapEth ? marketCapEth * ethPriceUsd : null;

        return {
          marketCapEth: marketCapEth,
          marketCapUsd: marketCapUsd,
          effectiveSwapFee: actualSwapFee,
          isZCurveBonding: false,
        };
      }

      // For regular Cookbook coins, calculate market cap from reserves if available
      if (reserves && reserves.reserve0 > 0n && reserves.reserve1 > 0n) {
        const ethReserve = Number(formatEther(reserves.reserve0));
        const tokenReserve = Number(formatEther(reserves.reserve1));
        const price = ethReserve / tokenReserve;
        // Use actual total supply from the indexer or holders (in wei, so format it)
        const supply = actualTotalSupply
          ? Number(formatEther(actualTotalSupply))
          : null;
        const marketCapEth = supply ? price * supply : null;
        const marketCapUsd = marketCapEth ? marketCapEth * ethPriceUsd : null;

        return {
          marketCapEth: marketCapEth,
          marketCapUsd: marketCapUsd,
          effectiveSwapFee: actualSwapFee,
          isZCurveBonding: false,
        };
      }

      return {
        marketCapEth: coinData?.marketCapEth ?? null,
        marketCapUsd: coinData?.marketCapEth
          ? coinData.marketCapEth * ethPriceUsd
          : null,
        effectiveSwapFee: actualSwapFee,
        isZCurveBonding: false,
      };
    }, [
      coinData,
      ethPriceData,
      zcurveSale,
      swapFees,
      reserves,
      actualTotalSupply,
    ]);

  return (
    <div>
      <CoinBreadcrumb coinId={token.id} />
      <AiMetaCard id={token.id.toString()} address={token.address} />

      <ErrorBoundary
        fallback={
          <ErrorFallback errorMessage="Error rendering Coin Info Card" />
        }
      >
        {tokenData ? (
          <CoinInfoCard
            coinId={token.id}
            name={name}
            symbol={symbol}
            description={
              description ??
              tokenData?.description ??
              t("coin.no_description", "No description available")
            }
            imageUrl={imageUrl}
            swapFee={effectiveSwapFee}
            isOwner={false}
            marketCapEth={marketCapEth ?? 0}
            marketCapUsd={marketCapUsd ?? 0}
            isEthPriceData={ethPriceData !== undefined}
            tokenURI={tokenURI}
            isLoading={isLoadingCoin}
            isZCurveBonding={isZCurveBonding}
            zcurveFeeOrHook={zcurveSale?.feeOrHook}
            creator={zcurveSale?.creator}
            className="my-4"
          />
        ) : null}
      </ErrorBoundary>

      <div className="flex flex-row justify-between items-center">
        {(!zcurveSale || zcurveSale.status !== "ACTIVE") && (
          <ErrorBoundary
            fallback={
              <ErrorFallback errorMessage="Error rendering voting panel" />
            }
          >
            <VotePanel coinId={token?.id} />
          </ErrorBoundary>
        )}
        <ErrorBoundary
          fallback={
            <ErrorFallback errorMessage="Error rendering voting panel" />
          }
        >
          <WrapTokenManager token={tokenMetadata} />
        </ErrorBoundary>
      </div>

      <div className="my-4">
        {/* Unified Trading Interface */}
        <ErrorBoundary
          fallback={
            <ErrorFallback errorMessage="Error rendering trading interface" />
          }
        >
          <UnifiedCoinTrading
            coinId={token?.id?.toString()}
            token={token.address}
            coinName={name}
            coinSymbol={symbol}
            coinIcon={imageUrl}
            poolId={poolId?.toString()}
            totalSupply={actualTotalSupply || undefined}
          />
        </ErrorBoundary>
      </div>

      {/* Pool Overview - only show if AMM pool exists */}
      {(!zcurveSale || zcurveSale.status === "FINALIZED") && (
        <PoolOverview
          coinId={token.id.toString()}
          poolId={poolId.toString()}
          symbol={symbol}
          token={token.address}
          priceImpact={null}
        />
      )}
    </div>
  );
};
