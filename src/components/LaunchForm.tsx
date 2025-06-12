import { useMemo, useState, ChangeEvent } from "react";
import { useWriteContract } from "wagmi";
import { ZAMMLaunchAddress, ZAMMLaunchAbi } from "@/constants/ZAMMLaunch";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { z } from "zod";

// shadcn components
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";

import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Line,
  Area,
} from "recharts";
import { parseEther } from "viem";
import { toast } from "sonner";
import { generateRandomSlug } from "@/lib/utils";
import { XIcon } from "lucide-react";

const defaultTranche = {
  coins: 1000000,
  price: 0.01,
};

// Validation schema with zod
const launchFormSchema = z.object({
  creatorSupply: z.coerce.number().min(1, "Creator supply is required"),
  creatorUnlockDate: z.string().optional(),
  metadataName: z.string().min(1, "Name is required"),
  metadataSymbol: z.string().min(1, "Symbol is required").max(5),
  metadataDescription: z.string().optional(),
  tranches: z
    .array(
      z.object({
        coins: z.coerce.number().min(0, "Coins amount is required"),
        price: z.coerce.number().min(0, "Price is required"),
      }),
    )
    .min(1, "At least one tranche is required"),
});

type LaunchFormValues = z.infer<typeof launchFormSchema>;

export const LaunchForm = () => {
  const { data: hash, error, isPending, writeContract } = useWriteContract();

  // State for form data instead of react-hook-form
  const [formData, setFormData] = useState<LaunchFormValues>({
    creatorSupply: 1000000,
    creatorUnlockDate: "",
    metadataName: "",
    metadataSymbol: "",
    metadataDescription: "",
    tranches: [
      { coins: defaultTranche.coins, price: defaultTranche.price },
      {
        coins: defaultTranche.coins,
        price: defaultTranche.price + defaultTranche.price * 1,
      },
      {
        coins: defaultTranche.coins,
        price: defaultTranche.price + defaultTranche.price * 2,
      },
    ],
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Keep track of the image buffer outside of the form state
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTrancheChange = (
    index: number,
    field: "coins" | "price",
    value: string,
  ) => {
    setFormData((prev) => {
      const newTranches = [...prev.tranches];
      newTranches[index][field] = parseFloat(value);
      return {
        ...prev,
        tranches: newTranches,
      };
    });
  };

  const addTranche = () => {
    setFormData((prev) => ({
      ...prev,
      tranches: [
        ...prev.tranches,
        {
          coins: defaultTranche.coins,
          price: parseFloat(
            (
              Number(defaultTranche.price) +
              prev.tranches.length * Number(defaultTranche.price)
            ).toFixed(2),
          ),
        },
      ],
    }));
  };

  const removeTranche = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      tranches: prev.tranches.filter((_, i) => i !== index),
    }));
  };

  /* ---------- bonding‑curve helpers ---------- */
  const handleBarClick = (originalIndex: number) => {
    const current = formData.tranches[originalIndex].price.toString();
    const next = prompt("Enter new price for this tranche (ETH)", current);
    if (next !== null) {
      handleTrancheChange(originalIndex, "price", next);
    }
  };

  const handleImageFileChange = (value: File | File[] | undefined) => {
    if (value && !Array.isArray(value)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBuffer(e.target?.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(value);
    }
  };

  /* ---------- submit ---------- */
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);

    try {
      // Validate with zod
      const validatedData = launchFormSchema.parse(formData);
      setErrors({});

      if (!imageBuffer) {
        toast.error("Please select an image file");
        return;
      }

      const unlockTs = validatedData.creatorUnlockDate
        ? Math.floor(
            new Date(validatedData.creatorUnlockDate).getTime() / 1_000,
          )
        : 0;

      const fileName = `${generateRandomSlug()}_logo.png`;

      const imgUri = await pinImageToPinata(imageBuffer, fileName, {
        name: fileName,
      });

      const uri = await pinJsonToPinata({
        name: validatedData.metadataName || fileName,
        symbol: validatedData.metadataSymbol || "",
        description: validatedData.metadataDescription,
        image: imgUri,
      });

      const trancheCoins = validatedData.tranches.map((t) =>
        parseEther(t.coins.toString()),
      );
      const tranchePrices = validatedData.tranches.map((t) =>
        parseEther(t.price.toString()),
      );

      writeContract({
        abi: ZAMMLaunchAbi,
        address: ZAMMLaunchAddress,
        functionName: "launch",
        args: [
          parseEther(validatedData.creatorSupply.toString()) ?? 0n,
          BigInt(unlockTs),
          uri,
          trancheCoins,
          tranchePrices,
        ],
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Transform zod errors into a more manageable form
        const formattedErrors: Record<string, string> = {};
        err.errors.forEach((error) => {
          const path = error.path.join(".");
          formattedErrors[path] = error.message;
        });
        setErrors(formattedErrors);
        toast.error("Please fix the form errors");
      } else {
        console.error(err);
        toast.error(
          `Failed to launch: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  const chartData = useMemo(() => {
    return formData.tranches
      .map((t, i) => ({
        originalIndex: i,
        priceNum: t.price,
        name: `T${i + 1}`,
      }))
      .sort((a, b) => a.priceNum - b.priceNum);
  }, [formData.tranches]);

  return (
    <form
      onSubmit={onSubmit}
      className="grid grid-cols-2 space-x-2 p-4 w-screen mx-auto"
    >
      <div className="space-y-2">
        {/* creator supply & unlock */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="creatorSupply">Creator Supply (uint96)</Label>
          <Input
            id="creatorSupply"
            name="creatorSupply"
            type="number"
            placeholder="e.g. 1000000"
            value={formData.creatorSupply}
            onChange={handleInputChange}
          />
          {errors["creatorSupply"] && (
            <p className="text-sm text-red-500">{errors["creatorSupply"]}</p>
          )}
        </div>

        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="creatorUnlockDate">Creator Unlock Time</Label>
          <Input
            id="creatorUnlockDate"
            name="creatorUnlockDate"
            type="datetime-local"
            value={formData.creatorUnlockDate}
            onChange={handleInputChange}
          />
          {errors["creatorUnlockDate"] && (
            <p className="text-sm text-red-500">
              {errors["creatorUnlockDate"]}
            </p>
          )}
        </div>

        {/* token logo */}
        <div className="space-y-2">
          <Label htmlFor="imageFile">Coin Image</Label>
          <ImageInput onChange={handleImageFileChange} />
          {!imageBuffer && isSubmitted && (
            <p className="text-sm text-red-500">Image is required</p>
          )}
        </div>

        {/* metadata */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataName">Name</Label>
          <Input
            id="metadataName"
            name="metadataName"
            placeholder="My Awesome Coin"
            value={formData.metadataName}
            onChange={handleInputChange}
          />
          {errors["metadataName"] && (
            <p className="text-sm text-red-500">{errors["metadataName"]}</p>
          )}
        </div>

        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataSymbol">Symbol</Label>
          <Input
            id="metadataSymbol"
            name="metadataSymbol"
            placeholder="MYC"
            value={formData.metadataSymbol}
            onChange={handleInputChange}
          />
          {errors["metadataSymbol"] && (
            <p className="text-sm text-red-500">{errors["metadataSymbol"]}</p>
          )}
        </div>

        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataDescription">Description</Label>
          <Textarea
            id="metadataDescription"
            name="metadataDescription"
            rows={3}
            placeholder="A brief description of the coin"
            value={formData.metadataDescription || ""}
            onChange={handleInputChange}
          />
          {errors["metadataDescription"] && (
            <p className="text-sm text-red-500">
              {errors["metadataDescription"]}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        {/* ----- bonding curve visual + tranche editor ----- */}
        <div className="bg-sidebar rounded-2xl shadow-sm p-4">
          <h3 className="text-lg font-semibold mb-1">Bonding Curve</h3>
          <label className="text-sm text-gray-500 mb-4 block">
            click bars to edit prices
          </label>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 20, bottom: 10, left: 10 }}
              >
                <defs>
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
                        <div className="font-medium text-blue-500">
                          {typeof payload[0]?.value === "number"
                            ? payload[0].value.toFixed(4)
                            : payload[0]?.value}{" "}
                          ETH
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

                {/* bars stay interactive */}
                <Bar
                  dataKey="priceNum"
                  fill="url(#priceGradient)"
                  radius={[6, 6, 0, 0]}
                  onClick={(_d, idx) =>
                    handleBarClick(chartData[idx].originalIndex)
                  }
                  isAnimationActive
                  animationDuration={800}
                />

                {/* cyan curve on top of the bars */}
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
                  isAnimationActive
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={addTranche}>
              Add Tranche
            </Button>
          </div>
        </div>
        <div className="max-h-[35vh] pr-1 overflow-y-scroll">
          {/* tranche raw inputs – allow granular control + coins */}
          {formData.tranches.map((tranche, idx) => (
            <div
              key={idx}
              className="flex flex-col sm:flex-row items-end gap-4 pb-4 last:pb-0"
            >
              <div className="flex-grow grid w-full items-center gap-1.5">
                <Label htmlFor={`trancheCoins-${idx}`}>Coins</Label>
                <Input
                  id={`trancheCoins-${idx}`}
                  type="number"
                  value={tranche.coins}
                  onChange={(e) =>
                    handleTrancheChange(idx, "coins", e.target.value)
                  }
                />
                {errors[`tranches.${idx}.coins`] && (
                  <p className="text-sm text-red-500">
                    {errors[`tranches.${idx}.coins`]}
                  </p>
                )}
              </div>
              <div className="flex-grow grid w-full items-center gap-1.5">
                <Label htmlFor={`tranchePrice-${idx}`}>Price (ETH)</Label>
                <Input
                  id={`tranchePrice-${idx}`}
                  type="number"
                  value={tranche.price}
                  onChange={(e) =>
                    handleTrancheChange(idx, "price", e.target.value)
                  }
                />
                {errors[`tranches.${idx}.price`] && (
                  <p className="text-sm text-red-500">
                    {errors[`tranches.${idx}.price`]}
                  </p>
                )}
              </div>
              {formData.tranches.length > 1 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => removeTranche(idx)}
                  type="button"
                >
                  <XIcon />
                </Button>
              )}
            </div>
          ))}
        </div>
        {/* submit */}
        <Button type="submit" disabled={isPending} className="mt-2 w-full">
          {isPending ? "Launching…" : "Launch Coin Sale"}
        </Button>

        {hash && (
          <Alert className="mt-4">
            <AlertTitle>Transaction Sent!</AlertTitle>
            <AlertDescription>Check transaction hash: {hash}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
};
