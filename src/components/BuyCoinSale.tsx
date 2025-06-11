import { ZAMMLaunchAbi, ZAMMLaunchAddress } from "@/constants/ZAMMLaunch";
import { useQuery } from "@tanstack/react-query";
import { useWriteContract } from "wagmi";
import {
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatEther } from "viem";
import { Badge } from "./ui/badge";
import { PillIndicator } from "./ui/pill";
import { Button } from "./ui/button";

const statusToPillVariant = (status: string) => {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "FINALIZED":
      return "info";
    case "EXPIRED":
      return "error";
    default:
      return "info";
  }
};

const useCoinSale = ({ coinId }: { coinId: string }) => {
  return useQuery({
    queryKey: ["coin-sale", coinId],
    queryFn: async () => {
      const response = await fetch(
        import.meta.env.VITE_INDEXER_URL + "/graphql",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `
              query SaleQuery {
                sales(where: {coinId: "${coinId}"}) {
                  items {
                    blockNumber
                    coinId
                    coinsSold
                    createdAt
                    creator
                    deadlineLast
                    ethRaised
                    id
                    saleSupply
                    status
                    tranches {
                      items {
                        coins
                        deadline
                        price
                        remaining
                        trancheIndex
                        sold
                      }
                    }
                  }
                }
              }
            `,
          }),
        },
      );

      const json = await response.json();
      return json.data.sales.items[0];
    },
  });
};

interface Tranche {
  coins: string;
  deadline: string;
  price: string;
  remaining: string;
  trancheIndex: number;
  sold: string;
}

export const BuyCoinSale = ({
  coinId,
  symbol,
}: {
  coinId: bigint;
  symbol: string;
}) => {
  const { data: sale, isLoading } = useCoinSale({ coinId: coinId.toString() });
  const { writeContract } = useWriteContract();

  if (isLoading) return <div>Loading...</div>;
  if (!sale) return <div>Sale not found</div>;

  // @TODO
  // if (sale.status === "FINALIZED")
  //   return <BuySellCookbookCoin coinId={coinId} symbol={symbol} />;

  const activeTranches = sale.tranches.items.filter(
    (tranche: Tranche) =>
      parseInt(tranche.remaining) > 0 &&
      new Date(Number(tranche.deadline) * 1000) > new Date(),
  );

  const cheapestTranche = activeTranches.reduce(
    (prev: Tranche, curr: Tranche) =>
      BigInt(prev.price) < BigInt(curr.price) ? prev : curr,
    activeTranches[0],
  );

  // Prepare data for recharts
  const chartData = sale.tranches.items.map((tranche: Tranche) => ({
    name: `Tranche ${tranche.trancheIndex}`,
    sold: Number(formatEther(BigInt(tranche.sold))),
    remaining: Number(formatEther(BigInt(tranche.remaining))),
    price: Number(formatEther(BigInt(tranche.price))),
    priceNum: Number(formatEther(BigInt(tranche.price))), // For the line chart
    deadline: new Date(Number(tranche.deadline) * 1000).toLocaleString(),
    trancheIndex: tranche.trancheIndex,
  }));

  return (
    <div className="border-2 border-secondary">
      <div className="flex justify-between items-center p-2 border-b border-secondary">
        <h2 className="text-xl font-bold ">Sale</h2>
        <Badge variant="outline">
          <PillIndicator variant={statusToPillVariant(sale.status)} pulse />
          <span className="ml-1">{sale.status}</span>
        </Badge>
      </div>

      <div className="p-2">
        <div>
          Supply: {formatEther(BigInt(sale.saleSupply))} {symbol}
        </div>
        <h3 className="text-lg font-semibold mt-4 mb-2">Tranches</h3>
        <div className="bg-sidebar rounded-2xl shadow-sm p-4">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
              >
                <defs>
                  <linearGradient id="soldGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8884d8" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#8884d8" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient
                    id="remainingGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#82ca9d" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#82ca9d" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient
                    id="priceGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#00e5ff" stopOpacity={0.2} />
                  </linearGradient>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#00e5ff" />
                    <stop offset="100%" stopColor="#4dd0e1" />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  horizontal={true}
                  vertical={false}
                  stroke="#e2e8f0"
                  strokeDasharray="1 4"
                />

                <XAxis
                  dataKey="name"
                  axisLine={{ stroke: "#cbd5e0" }}
                  tickLine={false}
                  tick={{ fill: "#4a5568", fontSize: 12 }}
                />

                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#4a5568", fontSize: 12 }}
                />

                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white p-2 rounded shadow-lg text-sm">
                        <div className="text-gray-600 mb-1">{label}</div>
                        <div className="font-medium text-purple-500">
                          Sold: {payload[0]?.value?.toFixed(4)} {symbol}
                        </div>
                        <div className="font-medium text-green-500">
                          Remaining: {payload[1]?.value?.toFixed(4)} {symbol}
                        </div>
                        <div className="font-medium text-blue-500">
                          Price: {payload[2]?.value?.toFixed(4)} ETH
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Deadline:{" "}
                          {chartData.find((d) => d.name === label)?.deadline}
                        </div>
                      </div>
                    );
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="priceNum"
                  fill="url(#priceGradient)"
                  fillOpacity={0.15}
                  stroke="none"
                />

                <Bar
                  dataKey="sold"
                  stackId="a"
                  fill="url(#soldGradient)"
                  radius={[6, 0, 0, 6]}
                  name="Sold"
                  isAnimationActive
                  animationDuration={800}
                />

                <Bar
                  dataKey="remaining"
                  stackId="a"
                  fill="url(#remainingGradient)"
                  radius={[0, 6, 6, 0]}
                  name="Remaining"
                  isAnimationActive
                  animationDuration={800}
                />

                <Line
                  type="monotone"
                  dataKey="priceNum"
                  stroke="url(#lineGradient)"
                  strokeWidth={3}
                  dot={{
                    r: 4,
                    fill: "#00e5ff",
                    stroke: "#fff",
                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 6 }}
                  name="Price (ETH)"
                  isAnimationActive
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {cheapestTranche && (
        <div className="mt-4 p-4 bg-sidebar rounded-2xl shadow-sm mx-2 mb-2">
          <h3 className="text-lg font-semibold mb-2">
            Buy from cheapest active tranche
          </h3>
          <div className="mb-4">
            Price: {formatEther(BigInt(cheapestTranche.price))} ETH
          </div>
          <Button
            className="w-full"
            onClick={() => {
              writeContract({
                address: ZAMMLaunchAddress,
                abi: ZAMMLaunchAbi,
                functionName: "buy",
                args: [coinId, BigInt(cheapestTranche.trancheIndex)],
                value: BigInt(cheapestTranche.price),
              });
            }}
          >
            Buy from Tranche {cheapestTranche.trancheIndex}
          </Button>
        </div>
      )}
    </div>
  );
};
