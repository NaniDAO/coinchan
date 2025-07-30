import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { parseEther, formatEther } from "viem";
import { generatePriceCurve } from "./zCurveAnalysis";
import { calculateDivisor } from "./zCurveMath";

interface CurveComparisonProps {
  saleCap?: bigint;
  quadCap?: bigint;
}

export function CurveComparison({
  saleCap = parseEther("800000000"),
  quadCap = parseEther("200000000"),
}: CurveComparisonProps) {
  // Generate data for different target raises
  const targets = [
    { name: "0.01 ETH (Current)", target: parseEther("0.01"), color: "#ef4444" },
    { name: "1 ETH (Balanced)", target: parseEther("1"), color: "#3b82f6" },
    { name: "2 ETH (Recommended)", target: parseEther("2"), color: "#10b981" },
    { name: "8.5 ETH (Pump.fun)", target: parseEther("8.5"), color: "#a855f7" },
  ];

  // Generate curve data for each target
  const curveData = targets.map(({ name, target, color }) => {
    const divisor = calculateDivisor(saleCap, quadCap, target);
    const points = generatePriceCurve(saleCap, quadCap, divisor, 100);

    return {
      name,
      color,
      data: points.map((p) => ({
        percentSold: p.percentSold,
        priceETH: Number(formatEther(p.marginalPrice)),
        totalRaisedETH: Number(formatEther(p.totalCost)),
      })),
    };
  });

  // Combine data for the chart
  const chartData = curveData[0].data.map((_, index) => {
    const point: any = { percentSold: curveData[0].data[index].percentSold };
    curveData.forEach((curve) => {
      point[`price_${curve.name}`] = curve.data[index].priceETH;
    });
    return point;
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">zCurve Price Comparison</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="percentSold" label={{ value: "Supply Sold (%)", position: "insideBottom", offset: -5 }} />
            <YAxis
              label={{ value: "Price per Token (ETH)", angle: -90, position: "insideLeft" }}
              tickFormatter={(value) => value.toExponential(2)}
            />
            <Tooltip
              formatter={(value: number) => value.toExponential(4)}
              labelFormatter={(label) => `${label}% sold`}
            />
            <Legend />
            {curveData.map((curve) => (
              <Line
                key={curve.name}
                type="monotone"
                dataKey={`price_${curve.name}`}
                stroke={curve.color}
                name={curve.name}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {targets.map(({ name, target, color }) => {
          const divisor = calculateDivisor(saleCap, quadCap, target);
          const avgPrice = (target * parseEther("1")) / saleCap;

          return (
            <div key={name} className="border rounded-lg p-4" style={{ borderColor: color }}>
              <h4 className="font-semibold mb-2" style={{ color }}>
                {name}
              </h4>
              <div className="space-y-1 text-sm">
                <p>Target Raise: {formatEther(target)} ETH</p>
                <p>Avg Price: {formatEther(avgPrice)} ETH/token</p>
                <p>Divisor: {divisor.toString().slice(0, 20)}...</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Key Observations:</h4>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li>The quadratic phase (0-25%) shows steeper price increases</li>
          <li>After 25%, all curves become linear with constant prices</li>
          <li>Higher targets create more dramatic price curves</li>
          <li>The 0.01 ETH curve is essentially flat (bad for price discovery)</li>
          <li>2-8.5 ETH targets create meaningful price appreciation</li>
        </ul>
      </div>
    </div>
  );
}
