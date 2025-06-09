import { useMemo, useState } from "react";
import { useWriteContract } from "wagmi";
import { ZAMMLaunchAddress, ZAMMLaunchAbi } from "@/constants/ZAMMLaunch";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// shadcn components
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// recharts for interactive bonding‑curve visual
import {
  ResponsiveContainer,
  ComposedChart, // 👈  instead of BarChart
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

  // React Hook Form with zod resolver
  const form = useForm<LaunchFormValues>({
    resolver: zodResolver(launchFormSchema),
    defaultValues: {
      creatorSupply: 1000000,
      creatorUnlockDate: "",
      metadataName: "",
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
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "tranches",
  });

  // Keep track of the image buffer outside of the form state
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);

  /* ---------- bonding‑curve helpers ---------- */
  // Watch all tranches to ensure the chart updates on any change
  const watchedTranches = form.watch("tranches");

  const handleBarClick = (originalIndex: number) => {
    const current = form.getValues(`tranches.${originalIndex}.price`) || "0";
    const next = prompt(
      "Enter new price for this tranche (ETH)",
      current.toString(),
    );
    if (next !== null) {
      form.setValue(`tranches.${originalIndex}.price`, parseFloat(next), {
        shouldValidate: true,
      });
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
  const onSubmit = async (data: LaunchFormValues) => {
    if (!imageBuffer) {
      toast.error("Please select an image file");
      return;
    }

    const unlockTs = data.creatorUnlockDate
      ? Math.floor(new Date(data.creatorUnlockDate).getTime() / 1_000)
      : 0;

    try {
      const fileName = `${generateRandomSlug()}_logo.png`;

      const imgUri = await pinImageToPinata(imageBuffer, fileName, {
        name: fileName,
      });

      const uri = await pinJsonToPinata({
        name: data.metadataName || fileName,
        symbol: data.metadataSymbol || "",
        description: data.metadataDescription,
        image: imgUri,
      });

      const trancheCoins = data.tranches.map((t) =>
        parseEther(t.coins.toString()),
      );
      const tranchePrices = data.tranches.map((t) =>
        parseEther(t.price.toString()),
      );

      writeContract({
        abi: ZAMMLaunchAbi,
        address: ZAMMLaunchAddress,
        functionName: "launch",
        args: [
          parseEther(data.creatorSupply.toString()) ?? 0n,
          BigInt(unlockTs),
          uri,
          trancheCoins,
          tranchePrices,
        ],
      });
    } catch (err) {
      console.error(err);
      toast.error(
        `Failed to launch: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  const chartData = useMemo(() => {
    return watchedTranches
      .map((t, i) => ({
        originalIndex: i,
        priceNum: t.price,
        name: `T${i + 1}`,
      }))
      .sort((a, b) => a.priceNum - b.priceNum);
  }, [watchedTranches]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-2 space-x-2 p-4 w-screen mx-auto"
      >
        <div className="space-y-2">
          {/* creator supply & unlock */}
          <FormField
            control={form.control}
            name="creatorSupply"
            render={({ field }) => (
              <FormItem className="grid w-full items-center gap-1.5">
                <FormLabel htmlFor="creatorSupply">
                  Creator Supply (uint96)
                </FormLabel>
                <FormControl>
                  <Input
                    id="creatorSupply"
                    type="number"
                    placeholder="e.g. 1000000"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="creatorUnlockDate"
            render={({ field }) => (
              <FormItem className="grid w-full items-center gap-1.5">
                <FormLabel htmlFor="creatorUnlock">
                  Creator Unlock Time
                </FormLabel>
                <FormControl>
                  <Input id="creatorUnlock" type="datetime-local" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* token logo */}
          <div className="space-y-2">
            <Label htmlFor="imageFile">Coin Image</Label>
            <ImageInput onChange={handleImageFileChange} />
            {!imageBuffer && form.formState.isSubmitted && (
              <p className="text-sm text-red-500">Image is required</p>
            )}
          </div>

          {/* metadata */}
          <FormField
            control={form.control}
            name="metadataName"
            render={({ field }) => (
              <FormItem className="grid w-full items-center gap-1.5">
                <FormLabel htmlFor="metadataName">Name</FormLabel>
                <FormControl>
                  <Input
                    id="metadataName"
                    placeholder="My Awesome Coin"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="metadataSymbol"
            render={({ field }) => (
              <FormItem className="grid w-full items-center gap-1.5">
                <FormLabel htmlFor="metadataSymbol">Symbol</FormLabel>
                <FormControl>
                  <Input id="metadataSymbol" placeholder="MYC" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="metadataDescription"
            render={({ field }) => (
              <FormItem className="grid w-full items-center gap-1.5">
                <FormLabel htmlFor="metadataDescription">Description</FormLabel>
                <FormControl>
                  <Textarea
                    id="metadataDescription"
                    rows={3}
                    placeholder="A brief description of the coin"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
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
                      <stop
                        offset="100%"
                        stopColor="#00e5ff"
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                    <linearGradient
                      id="lineGradient"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
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
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  append({
                    coins: defaultTranche.coins,
                    price: parseFloat(
                      (
                        Number(defaultTranche.price) +
                        chartData.length * Number(defaultTranche.price)
                      ).toFixed(2),
                    ),
                  })
                }
              >
                Add Tranche
              </Button>
            </div>
          </div>
          <div className="max-h-[35vh]  pr-1 overflow-y-scroll">
            {/* tranche raw inputs – allow granular control + coins */}
            {fields.map((field, idx) => (
              <div
                key={field.id}
                className="flex flex-col sm:flex-row items-end gap-4 pb-4 last:pb-0"
              >
                <FormField
                  control={form.control}
                  name={`tranches.${idx}.coins`}
                  render={({ field }) => (
                    <FormItem className="flex-grow grid w-full items-center gap-1.5">
                      <FormLabel htmlFor={`trancheCoins-${idx}`}>
                        Coins
                      </FormLabel>
                      <FormControl>
                        <Input
                          id={`trancheCoins-${idx}`}
                          type="number"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`tranches.${idx}.price`}
                  render={({ field }) => (
                    <FormItem className="flex-grow grid w-full items-center gap-1.5">
                      <FormLabel htmlFor={`tranchePrice-${idx}`}>
                        Price (ETH)
                      </FormLabel>
                      <FormControl>
                        <Input
                          id={`tranchePrice-${idx}`}
                          type="number"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {fields.length > 1 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => remove(idx)}
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
              <AlertDescription>
                Check transaction hash: {hash}
              </AlertDescription>
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
    </Form>
  );
};
