import { useQuery } from "@tanstack/react-query";

import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import { formatUnits } from "viem";
import { Table, TableBody, TableCell, TableHead, TableRow } from "./ui/table";
import { useReadContract } from "wagmi";
import { CoinsAbi, CoinsAddress } from "@/constants/Coins";
import { mainnet } from "viem/chains";

interface Holder {
  address: string;
  balance: string;
}

const useCoinHolders = (coinId: string) => {
  return useQuery({
    queryKey: ["coinHolders", coinId],
    queryFn: async () => {
      const response = await fetch(
        import.meta.env.VITE_INDEXER_URL + `/api/holders?coinId=${coinId}`,
      );

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

  return (
    <div>
      <CoinHoldersTreemap data={data} symbol={symbol} />
      <CoinHoldersTable coinId={BigInt(coinId)} data={data} symbol={symbol} />
    </div>
  );
};

export const CoinHoldersTreemap = ({
  data,
  symbol,
}: {
  data: Holder[];
  symbol: string;
}) => {
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
              return (
                <div className="bg-white shadow p-2 rounded text-sm text-black">
                  <div>
                    <b>Address:</b>{" "}
                    <a
                      href={`https://etherscan.io/address/${item.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-500"
                    >
                      {item.address}
                    </a>
                  </div>
                  <div>
                    <b>Balance:</b> {item.size.toFixed(4)} {symbol}
                  </div>
                </div>
              );
            }}
          />
        </Treemap>
      </ResponsiveContainer>
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
    <a
      href={`https://etherscan.io/address/${address}`}
      target="_blank"
      rel="noopener noreferrer"
    >
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
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            fill="#fff"
            fontSize={12}
          >
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
  coinId,
  symbol,
}: {
  data: Holder[];
  coinId: bigint;
  symbol: string;
}) => {
  const { data: totalSupply } = useReadContract({
    address: CoinsAddress,
    abi: CoinsAbi,
    functionName: "totalSupply",
    args: [coinId],
    chainId: mainnet.id,
  });

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
            <TableRow key={index}>
              <TableCell>{holder.address}</TableCell>
              <TableCell>
                {formatUnits(BigInt(holder.balance), 18)} {symbol}
              </TableCell>
              <TableCell>
                {Number(
                  (
                    (parseFloat(formatUnits(BigInt(holder.balance), 18)) /
                      parseFloat(
                        totalSupply
                          ? formatUnits(totalSupply, 18)
                          : DEFAULT_TOTAL_SUPPLY.toString(),
                      )) *
                    100
                  ).toString(),
                ).toFixed(4)}
                %
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
