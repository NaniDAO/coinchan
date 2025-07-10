import { useQuery } from "@tanstack/react-query";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { type Address, formatUnits, getAddress } from "viem";
import { useEnsName } from "wagmi";
import { Table, TableBody, TableCell, TableHead, TableRow } from "./ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { ZAMMAddress } from "@/constants/ZAAM";
import { CookbookAddress } from "@/constants/Cookbook";

interface Holder {
  address: string;
  balance: string;
}

const useCoinHolders = (coinId: string) => {
  return useQuery({
    queryKey: ["coinHolders", coinId],
    queryFn: async () => {
      const response = await fetch(import.meta.env.VITE_INDEXER_URL + `/api/holders?coinId=${coinId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch coin holders: ${response.status}`);
      }

      const data = await response.json();
      return data.data as Array<Holder>;
    },
  });
};

export const CoinHolders = ({
  coinId,
  symbol,
}: {
  coinId: string;
  symbol: string;
}) => {
  const { data, isLoading, error } = useCoinHolders(coinId);

  if (isLoading || !data) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  // Separate pool addresses from regular holders
  const poolAddresses = [ZAMMAddress.toLowerCase(), CookbookAddress.toLowerCase()];
  const poolHolders = data.filter(holder => 
    poolAddresses.includes(holder.address.toLowerCase())
  );
  const nonPoolHolders = data.filter(holder => 
    !poolAddresses.includes(holder.address.toLowerCase())
  );

  // Calculate total supply and pool percentage
  const totalSupply = data.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));
  const poolBalance = poolHolders.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));
  const poolPercentage = totalSupply > 0n ? (Number(poolBalance) / Number(totalSupply)) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Pool Holdings Card */}
      {poolHolders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pool Holdings</CardTitle>
            <CardDescription>
              Liquidity held by ZAMM and Cookbook pools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {poolHolders.map((holder, index) => {
                const isZAMM = holder.address.toLowerCase() === ZAMMAddress.toLowerCase();
                const poolName = isZAMM ? "ZAMM Pool" : "Cookbook Pool";
                const balance = formatUnits(BigInt(holder.balance), 18);
                const percentage = totalSupply > 0n ? 
                  (Number(BigInt(holder.balance)) / Number(totalSupply)) * 100 : 0;
                
                return (
                  <div key={index} className="flex justify-between items-center p-2 rounded bg-muted/50">
                    <div>
                      <div className="font-medium">{poolName}</div>
                      <div className="text-sm text-muted-foreground">
                        {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{Number(balance).toFixed(4)} {symbol}</div>
                      <div className="text-sm text-muted-foreground">{percentage.toFixed(2)}%</div>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2 mt-2 border-t">
                <div className="flex justify-between items-center font-medium">
                  <span>Total Pool Holdings</span>
                  <span>{poolPercentage.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-Pool Holders */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Token Holders</h3>
        <CoinHoldersTreemap data={nonPoolHolders} />
        <CoinHoldersTable data={nonPoolHolders} symbol={symbol} />
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
  const totalSupply = data.reduce((acc, holder) => acc + BigInt(holder.balance), BigInt(0));

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHead>Address</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Percentage</TableHead>
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
  key,
  address,
  balance,
  symbol,
  totalSupply,
}: {
  key: number;
  address: Address;
  balance: string;
  symbol: string;
  totalSupply: bigint;
}) => {
  const { data: ensName } = useEnsName({ address });

  return (
    <TableRow key={key}>
      <TableCell>{ensName ?? address}</TableCell>
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
