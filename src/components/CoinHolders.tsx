import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { type Address, formatUnits, getAddress } from "viem";
import { useEnsName } from "wagmi";
import { Table, TableBody, TableCell, TableHead, TableRow } from "./ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ZAMMAddress } from "@/constants/ZAAM";
import { CookbookAddress } from "@/constants/Cookbook";
import { useReserves } from "@/hooks/use-reserves";
import { computePoolId, SWAP_FEE } from "@/lib/swap";
import { isCookbookCoin } from "@/lib/coin-utils";
import { useMemo } from "react";
import { useGetCoin } from "@/hooks/metadata/use-get-coin";
import { contractsNameMap } from "@/lib/address";

interface Holder {
  address: string;
  balance: string;
}

const useCoinHolders = (coinId: string) => {
  return useQuery({
    queryKey: ["coinHolders", coinId],
    queryFn: async () => {
      const allHolders: Array<Holder> = [];
      let offset = 0;
      const limit = 100; // Use maximum allowed limit
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          `${import.meta.env.VITE_INDEXER_URL}/api/holders?coinId=${coinId}&limit=${limit}&offset=${offset}`,
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch coin holders: ${response.status}`);
        }

        const data = await response.json();

        // Add the current batch to our collection
        allHolders.push(...data.data);

        // Check if there are more records
        hasMore = data.hasMore;
        offset += limit;

        // Safety break to prevent infinite loops (optional)
        if (offset > 10000) {
          console.warn("Reached maximum offset limit of 10000");
          break;
        }
      }

      return allHolders;
    },
    // Add stale time to prevent unnecessary refetches
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Add retry configuration
    retry: 3,
  });
};

export const CoinHolders = ({
  coinId,
  symbol,
}: {
  coinId: string;
  symbol: string;
}) => {
  const { t } = useTranslation();
  const { data, isLoading, error } = useCoinHolders(coinId);

  // Check if this is a cookbook coin
  const isCookbook = useMemo(() => {
    return isCookbookCoin(BigInt(coinId));
  }, [coinId]);

  // Fetch coin metadata to get the actual swap fee
  const { data: coinData } = useGetCoin({
    coinId: coinId,
    token: isCookbook ? CookbookAddress : ZAMMAddress,
  });

  // Get the actual swap fee from the coin's pools, defaulting to SWAP_FEE if not found
  const actualSwapFee = useMemo(() => {
    if (coinData?.pools && coinData.pools.length > 0) {
      // Find the pool with coin0Id = 0 (ETH pool)
      const ethPool = coinData.pools.find((pool: any) => pool.coin0Id === 0n);
      if (ethPool?.swapFee) {
        return ethPool.swapFee;
      }
    }
    return SWAP_FEE;
  }, [coinData]);

  // For cookbook coins, fetch pool reserves
  const poolId = useMemo(() => {
    if (!isCookbook) return undefined;
    return computePoolId(BigInt(coinId), actualSwapFee, CookbookAddress);
  }, [coinId, isCookbook, actualSwapFee]);

  const { data: reserves } = useReserves({
    poolId,
    source: isCookbook ? "COOKBOOK" : "ZAMM",
  });

  // Separate different types of holders
  const poolAddresses = [ZAMMAddress.toLowerCase(), CookbookAddress.toLowerCase()];
  const [poolHolders, userHolders] = useMemo(() => {
    if (!data) return [[], []];

    const poolHolders = data.filter((holder) => poolAddresses.includes(holder.address.toLowerCase()));
    const userHolders = data.filter((holder) => !poolAddresses.includes(holder.address.toLowerCase()));

    return [poolHolders, userHolders];
  }, [data]);

  // For cookbook coins, get pool balance from reserves, otherwise from holders
  const poolBalance = useMemo(() => {
    if (isCookbook && reserves?.reserve1) {
      // For cookbook coins, the pool balance is in the reserves (reserve1 is the token)
      return reserves.reserve1;
    }
    // For ZAMM pools, use the holder balance
    return poolHolders.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));
  }, [isCookbook, reserves, poolHolders]);

  const userBalance = userHolders.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));

  // Calculate total supply - for cookbook coins, add pool reserves to holder totals
  const totalSupply = useMemo(() => {
    if (!data) return BigInt(0);
    const holderTotal = data.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));
    if (isCookbook && reserves?.reserve1) {
      // For cookbook coins, add the pool reserves to the total
      // But don't double-count if the Cookbook address is already in the holders list
      const cookbookHolding = data.find((h) => h.address.toLowerCase() === CookbookAddress.toLowerCase());
      if (!cookbookHolding || BigInt(cookbookHolding.balance) === 0n) {
        return holderTotal + reserves.reserve1;
      }
    }
    return holderTotal;
  }, [data, isCookbook, reserves]);

  const poolPercentage = totalSupply > 0n ? (Number(poolBalance) / Number(totalSupply)) * 100 : 0;
  const userPercentage = totalSupply > 0n ? (Number(userBalance) / Number(totalSupply)) * 100 : 0;

  if (isLoading || !data) return <div>{t("common.loading")}</div>;
  if (error)
    return (
      <div>
        {t("common.error")}: {error.message}
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Pool Holdings Card */}
      {(poolHolders.length > 0 || (isCookbook && poolBalance > 0n)) && (
        <Card>
          <CardHeader>
            <CardTitle>{t("holders.pool_holdings", "Pool Holdings")}</CardTitle>
            <CardDescription>
              {t("holders.pool_description", "Liquidity held by ZAMM and Cookbook pools")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {isCookbook && poolBalance > 0n ? (
                // For cookbook coins, show the pool reserves
                <div className="flex justify-between items-center p-2 rounded bg-muted/50">
                  <div>
                    <div className="font-medium">{t("holders.cookbook_pool", "V1 Pool")}</div>
                    <div className="text-sm text-muted-foreground">
                      {CookbookAddress.slice(0, 6)}...
                      {CookbookAddress.slice(-4)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {Number(formatUnits(poolBalance, 18)).toFixed(4)} {symbol}
                    </div>
                    <div className="text-sm text-muted-foreground">{poolPercentage.toFixed(2)}%</div>
                  </div>
                </div>
              ) : (
                // For ZAMM pools, show holder-based pool holdings
                poolHolders.map((holder, index) => {
                  const isZAMM = holder.address.toLowerCase() === ZAMMAddress.toLowerCase();
                  const poolName = isZAMM ? t("holders.zamm_pool", "V0 Pool") : t("holders.cookbook_pool", "V1 Pool");
                  const balance = formatUnits(BigInt(holder.balance), 18);
                  const percentage =
                    totalSupply > 0n ? (Number(BigInt(holder.balance)) / Number(totalSupply)) * 100 : 0;

                  return (
                    <div key={index} className="flex justify-between items-center p-2 rounded bg-muted/50">
                      <div>
                        <div className="font-medium">{poolName}</div>
                        <div className="text-sm text-muted-foreground">
                          {holder.address.slice(0, 6)}...
                          {holder.address.slice(-4)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {Number(balance).toFixed(4)} {symbol}
                        </div>
                        <div className="text-sm text-muted-foreground">{percentage.toFixed(2)}%</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div className="pt-2 mt-2 border-t">
                <div className="flex justify-between items-center font-medium">
                  <span>{t("holders.total_pool_holdings", "Total Pool Holdings")}</span>
                  <span>{poolPercentage.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Circulating Supply Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{t("holders.distribution_summary", "Token Distribution Summary")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span>{t("holders.pool_liquidity", "Pool Liquidity")}</span>
              <span className="font-medium">{poolPercentage.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span>{t("holders.user_holdings", "User Holdings")}</span>
              <span className="font-medium">{userPercentage.toFixed(2)}%</span>
            </div>
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between items-center font-semibold">
                <span>{t("holders.total_supply", "Total Supply")}</span>
                <span>{(poolPercentage + userPercentage).toFixed(2)}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User Holders */}
      <div>
        <h3 className="text-lg font-semibold mb-2">{t("holders.actual_holders", "Actual Token Holders")}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {t("holders.actual_holders_description", "Excluding pool liquidity")}
        </p>
        <CoinHoldersTreemap data={userHolders} />
        <CoinHoldersTable data={userHolders} symbol={symbol} />
      </div>
    </div>
  );
};

export const CoinHoldersTreemap = ({ data }: { data: Holder[] }) => {
  const sorted = [...data]
    .filter((item) => BigInt(item.balance) !== 0n)
    .sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));

  const chartData = sorted.map((holder, i) => ({
    name: holder.address.slice(0, 6) + "..." + holder.address.slice(-4),
    size: Number(formatUnits(BigInt(holder.balance), 18)),
    address: holder.address,
    rank: i,
    color: interpolateColor(i / sorted.length),
  }));

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={chartData}
          dataKey="size"
          nameKey="name"
          stroke="#fff"
          fill="#8884d8"
          aspectRatio={4 / 3}
          content={<CustomTreemapContent />}
        >
          <Tooltip
            content={({ payload }) => {
              if (!payload || payload.length === 0) return null;
              const item = payload[0].payload;
              return <CoinHolderTag address={item.address} balance={item.size} symbol={item.symbol} />;
            }}
          />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
};

export const CoinHolderTag = ({
  address,
  balance,
  symbol,
}: {
  address: Address;
  balance: number;
  symbol: string;
}) => {
  const { data: ensName } = useEnsName({ address });

  return (
    <div className="bg-white shadow p-2 rounded text-sm text-black">
      <div>
        <b>Address:</b>{" "}
        <a
          href={`https://etherscan.io/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-500"
        >
          {ensName ?? address}
        </a>
      </div>
      <div>
        <b>Balance:</b> {balance.toFixed(4)} {symbol}
      </div>
    </div>
  );
};

// Dynamic pretty color interpolation across a hue range (Red -> Yellow -> Green -> Cyan -> Blue)
const interpolateColor = (t: number): string => {
  // Map t (0 to 1) to a hue range, e.g., 0 (red) to 270 (blue)
  // This range covers Red -> Yellow -> Green -> Cyan -> Blue
  const hue = t * 270; // Hue in degrees (0-360)

  // Keep saturation and lightness constant for vibrant colors
  const saturation = 0.7; // 70%
  const lightness = 0.5; // 50%

  // HSL to RGB conversion logic
  const h = hue / 60;
  const s = saturation;
  const l = lightness;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;

  let r_prime, g_prime, b_prime;

  if (h >= 0 && h < 1) {
    [r_prime, g_prime, b_prime] = [c, x, 0];
  } else if (h >= 1 && h < 2) {
    [r_prime, g_prime, b_prime] = [x, c, 0];
  } else if (h >= 2 && h < 3) {
    [r_prime, g_prime, b_prime] = [0, c, x];
  } else if (h >= 3 && h < 4) {
    [r_prime, g_prime, b_prime] = [0, x, c];
  } else if (h >= 4 && h < 5) {
    [r_prime, g_prime, b_prime] = [x, 0, c];
  } else {
    // h >= 5 && h < 6
    [r_prime, g_prime, b_prime] = [c, 0, x];
  }

  const r = Math.round((r_prime + m) * 255);
  const g = Math.round((g_prime + m) * 255);
  const b = Math.round((b_prime + m) * 255);

  // Convert RGB to hex
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

// Custom styled blocks
const CustomTreemapContent = (props: any) => {
  const { x, y, width, height, address, color } = props;

  return (
    <a href={`https://etherscan.io/address/${address}`} target="_blank" rel="noopener noreferrer">
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: "#fff",
            strokeWidth: 1,
            cursor: "pointer",
          }}
        />
        {width > 60 && height > 20 ? (
          <text x={x + width / 2} y={y + height / 2} textAnchor="middle" fill="#fff" fontSize={12}>
            {/* {name} */}
          </text>
        ) : null}
      </g>
    </a>
  );
};

const DEFAULT_TOTAL_SUPPLY = 21_000_000;

const CoinHoldersTable = ({
  data,
  symbol,
}: {
  data: Holder[];
  symbol: string;
}) => {
  const { t } = useTranslation();
  const totalSupply = data.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHead>{t("common.address", "Address")}</TableHead>
          <TableHead>{t("common.amount", "Amount")}</TableHead>
          <TableHead>{t("holders.percentage", "Percentage")}</TableHead>
        </TableRow>
      </TableHead>
      <TableBody>
        {data.map((holder, index) => {
          return (
            <CoinHolderTableRow
              key={index}
              address={getAddress(holder.address)}
              balance={holder.balance}
              symbol={symbol}
              totalSupply={totalSupply ?? DEFAULT_TOTAL_SUPPLY}
            />
          );
        })}
      </TableBody>
    </Table>
  );
};

export const CoinHolderTableRow = ({
  address,
  balance,
  symbol,
  totalSupply,
}: {
  address: Address;
  balance: string;
  symbol: string;
  totalSupply: bigint;
}) => {
  const { data: ensName } = useEnsName({ address });

  const userName = useMemo(() => {
    const contractName = contractsNameMap[address.toLowerCase()];
    if (contractName) return contractName;
    if (ensName) return ensName;
    return address;
  }, [address, ensName]);

  return (
    <TableRow>
      <TableCell>{userName}</TableCell>
      <TableCell>
        {formatUnits(BigInt(balance), 18)} {symbol}
      </TableCell>
      <TableCell>
        {Number(
          (
            (Number.parseFloat(formatUnits(BigInt(balance), 18)) /
              Number.parseFloat(totalSupply ? formatUnits(totalSupply, 18) : DEFAULT_TOTAL_SUPPLY.toString())) *
            100
          ).toString(),
        ).toFixed(4)}
        %
      </TableCell>
    </TableRow>
  );
};
