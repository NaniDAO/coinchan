import { useMemo, useState, ChangeEvent } from "react";
import { useWriteContract, useAccount, usePublicClient } from "wagmi";
import { useTranslation } from "react-i18next";
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
import { TrancheInfoDialog } from "@/components/TrancheInfoDialog";
import { CookbookAbi, CookbookAddress } from "@/constants/Cookbook";

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
import {
  generateRandomSlug,
  formatNumberInput,
  handleNumberInputChange,
} from "@/lib/utils";
import { XIcon } from "lucide-react";
import { ChartIcon, CoinIcon, PoolIcon } from "./ui/icons";
import { Link } from "@tanstack/react-router";

const defaultTranche = {
  coins: 300000000,
  price: 1,
};

type LaunchMode = "simple" | "tranche" | "pool";

// Note: LAUNCH_MODES will be moved inside component to access translations
const getLaunchModes = (t: any) => ({
  simple: {
    id: "simple",
    title: t("create.simple_coin_title"),
    description: t("create.simple_coin_description"),
    icon: <CoinIcon />,
  },
  pool: {
    id: "pool",
    title: t("create.coin_with_pool_title"),
    description: t("create.coin_with_pool_description"),
    icon: <PoolIcon />,
  },
  tranche: {
    id: "tranche",
    title: t("create.tranche_sale_title"),
    description: t("create.tranche_sale_description"),
    icon: <ChartIcon />,
  },
});

// Validation schema with zod
const launchFormSchema = z
  .object({
    mode: z.enum(["simple", "tranche", "pool"]).default("pool"),
    creatorSupply: z.coerce.number().min(1, "Creator supply is required"),
    creatorUnlockDate: z.string().optional(),
    metadataName: z.string().min(1, "Name is required"),
    metadataSymbol: z.string().min(1, "Symbol is required").max(5),
    metadataDescription: z.string().optional(),
    poolSupply: z.coerce.number().min(0, "Pool supply is required").optional(),
    ethAmount: z.coerce.number().min(0, "ETH amount is required").optional(),
    tranches: z
      .array(
        z.object({
          coins: z.coerce.number().min(0, "Coins amount is required"),
          price: z.coerce.number().min(0, "Price is required"),
        }),
      )
      .min(1, "At least one tranche is required"),
  })
  .refine(
    (data) => {
      if (data.mode === "pool") {
        return (
          data.poolSupply &&
          data.poolSupply > 0 &&
          data.ethAmount &&
          data.ethAmount > 0
        );
      }
      if (data.mode === "tranche") {
        return data.tranches.length > 0;
      }
      return true; // simple mode only needs basic fields
    },
    {
      message: "Invalid configuration for selected mode",
      path: ["mode"],
    },
  )
  .transform((data) => {
    // For simple mode, clear tranche data to avoid validation issues
    if (data.mode === "simple") {
      return {
        ...data,
        tranches: [],
        poolSupply: undefined,
        ethAmount: undefined,
      };
    }
    return data;
  });

type LaunchFormValues = z.infer<typeof launchFormSchema>;

export const LaunchForm = () => {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const publicClient = usePublicClient();
  const { address: account } = useAccount();
  const { t } = useTranslation();
  const [launchId, setLaunchId] = useState<bigint | undefined>(undefined);

  const LAUNCH_MODES = getLaunchModes(t);

  // State for form data instead of react-hook-form
  const [formData, setFormData] = useState<LaunchFormValues>({
    mode: "pool",
    creatorSupply: 100000000,
    creatorUnlockDate: "",
    metadataName: "",
    metadataSymbol: "",
    metadataDescription: "",
    poolSupply: 900000000,
    ethAmount: 0.1,
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

    // Handle number inputs that need comma formatting
    if (name === "creatorSupply" || name === "poolSupply") {
      handleNumberInputChange(value, (cleanValue) => {
        setFormData((prev) => ({
          ...prev,
          [name]: cleanValue,
        }));
      });
      return;
    }

    // Handle regular inputs
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
    // Handle coins field with comma formatting
    if (field === "coins") {
      handleNumberInputChange(value, (cleanValue) => {
        setFormData((prev) => {
          const newTranches = [...prev.tranches];
          newTranches[index][field] = parseFloat(cleanValue) || 0;
          return {
            ...prev,
            tranches: newTranches,
          };
        });
      });
      return;
    }

    // Handle price field normally (small decimal values)
    setFormData((prev) => {
      const newTranches = [...prev.tranches];
      newTranches[index][field] = parseFloat(value) || 0;
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
    const next = prompt(t("create.error_enter_price"), current);
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
    if (!publicClient) return;

    try {
      // Validate with zod
      const validatedData = launchFormSchema.parse(formData);
      setErrors({});

      if (!imageBuffer) {
        toast.error(t("create.error_select_image"));
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

      let newCoinId;
      if (validatedData.mode === "simple") {
        // Use simple coin function from Cookbook
        if (!account) {
          toast.error(t("create.error_connect_wallet"));
          return;
        }

        newCoinId = (
          await publicClient.simulateContract({
            abi: CookbookAbi,
            address: CookbookAddress,
            functionName: "coin",
            args: [
              account, // creator (current user's address)
              parseEther(validatedData.creatorSupply.toString()),
              uri,
            ],
          })
        ).result;

        writeContract({
          abi: CookbookAbi,
          address: CookbookAddress,
          functionName: "coin",
          args: [
            account, // creator (current user's address)
            parseEther(validatedData.creatorSupply.toString()),
            uri,
          ],
        });
      } else if (validatedData.mode === "pool") {
        newCoinId = (
          await publicClient.simulateContract({
            abi: ZAMMLaunchAbi,
            address: ZAMMLaunchAddress,
            functionName: "coinWithPool",
            args: [
              parseEther(validatedData.poolSupply?.toString() || "0"),
              parseEther(validatedData.creatorSupply.toString()),
              BigInt(unlockTs),
              uri,
            ],
            value: parseEther(validatedData.ethAmount?.toString() || "0"),
          })
        ).result[0];
        // Use coinWithPool function
        writeContract({
          abi: ZAMMLaunchAbi,
          address: ZAMMLaunchAddress,
          functionName: "coinWithPool",
          args: [
            parseEther(validatedData.poolSupply?.toString() || "0"),
            parseEther(validatedData.creatorSupply.toString()),
            BigInt(unlockTs),
            uri,
          ],
          value: parseEther(validatedData.ethAmount?.toString() || "0"),
        });
      } else {
        // Use traditional tranche launch function
        const trancheCoins = validatedData.tranches.map((t) =>
          parseEther(t.coins.toString()),
        );
        const tranchePrices = validatedData.tranches.map((t) =>
          parseEther(t.price.toString()),
        );
        newCoinId = (
          await publicClient.simulateContract({
            abi: ZAMMLaunchAbi,
            address: ZAMMLaunchAddress,
            functionName: "launch",
            args: [
              parseEther(validatedData.creatorSupply.toString()),
              BigInt(unlockTs),
              uri,
              trancheCoins,
              tranchePrices,
            ],
          })
        ).result;
        writeContract({
          abi: ZAMMLaunchAbi,
          address: ZAMMLaunchAddress,
          functionName: "launch",
          args: [
            parseEther(validatedData.creatorSupply.toString()),
            BigInt(unlockTs),
            uri,
            trancheCoins,
            tranchePrices,
          ],
        });
      }

      setLaunchId(newCoinId);
    } catch (err) {
      if (err instanceof z.ZodError) {
        // Transform zod errors into a more manageable form
        const formattedErrors: Record<string, string> = {};
        err.errors.forEach((error) => {
          const path = error.path.join(".");
          formattedErrors[path] = error.message;
        });
        setErrors(formattedErrors);
        toast.error(t("create.error_fix_form"));
      } else {
        console.error(err);
        toast.error(
          `${t("create.error_failed_launch")}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  };

  // Robust calculation helpers
  const calculatePrice = () => {
    if (!formData.ethAmount || !formData.poolSupply || 
        formData.ethAmount <= 0 || formData.poolSupply <= 0) {
      return null;
    }
    const price = formData.ethAmount / formData.poolSupply;
    return isFinite(price) && price > 0 ? price : null;
  };

  const calculateMarketCap = () => {
    const price = calculatePrice();
    if (!price || !formData.creatorSupply || formData.creatorSupply < 0) {
      return null;
    }
    const totalSupply = (formData.poolSupply || 0) + formData.creatorSupply;
    const marketCap = price * totalSupply;
    return isFinite(marketCap) && marketCap > 0 ? marketCap : null;
  };

  const formatPrice = (price: number | null) => {
    if (price === null) return "--";
    if (price < 0.000000000001) return "< 0.000000000001";
    if (price > 1000000) return price.toExponential(4);
    return price.toFixed(12);
  };

  const formatMarketCap = (marketCap: number | null) => {
    if (marketCap === null) return "--";
    if (marketCap < 0.0001) return "< 0.0001";
    if (marketCap > 1000000) return marketCap.toExponential(4);
    return marketCap.toFixed(4);
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
      className="grid grid-cols-1 space-x-2 p-4 min-h-screeen mb-20 mx-auto"
    >
      <div className="space-y-2">
        {/* creator supply & unlock */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="creatorSupply">{t("create.creator_supply")}</Label>
          <Input
            id="creatorSupply"
            name="creatorSupply"
            type="text"
            placeholder="e.g. 100,000,000"
            value={formatNumberInput(formData.creatorSupply)}
            onChange={handleInputChange}
          />
          {errors["creatorSupply"] && (
            <p className="text-sm text-red-500">{errors["creatorSupply"]}</p>
          )}
        </div>

        {/* Creator Unlock Time - only show for tranche and pool modes */}
        {(formData.mode === "tranche" || formData.mode === "pool") && (
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="creatorUnlockDate">
              {t("create.creator_unlock_time")}
            </Label>
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
        )}

        {/* Launch Mode Selector */}
        <div className="grid w-full items-center gap-3">
          <Label className="text-base font-semibold">
            {t("create.launch_type")}
          </Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.values(LAUNCH_MODES).map((mode) => {
              const isTrancheMode = mode.id === "tranche";
              const isDisabled = isTrancheMode; // Disable tranche mode
              
              return (
                <label
                  key={mode.id}
                  className={`relative flex flex-col p-4 rounded-lg border-2 transition-all ${
                    isDisabled
                      ? "border-gray-300 bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
                      : formData.mode === mode.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 cursor-pointer hover:shadow-md"
                        : "border-gray-200 hover:border-gray-300 cursor-pointer hover:shadow-md"
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={mode.id}
                    checked={formData.mode === mode.id && !isDisabled}
                    onChange={(e) => {
                      if (!isDisabled) {
                        setFormData((prev) => ({
                          ...prev,
                          mode: e.target.value as LaunchMode,
                        }));
                      }
                    }}
                    disabled={isDisabled}
                    className="sr-only"
                  />
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{mode.icon}</div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{mode.title}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        {mode.description}
                      </div>
                    </div>
                    {formData.mode === mode.id && !isDisabled && (
                      <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* Upgrading overlay for tranche mode */}
                  {isTrancheMode && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/90 dark:bg-gray-900/90 rounded-lg">
                      <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {t("create.upgrading")}
                      </div>
                    </div>
                  )}
                </label>
              );
            })}
          </div>
          {errors["mode"] && (
            <p className="text-sm text-red-500">{errors["mode"]}</p>
          )}
        </div>

        {/* Pool Mode Inputs */}
        {formData.mode === "pool" && (
          <>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="poolSupply">
                {t("create.pool_supply_label")}
              </Label>
              <Input
                id="poolSupply"
                name="poolSupply"
                type="text"
                placeholder="e.g. 900,000,000"
                value={
                  formData.poolSupply
                    ? formatNumberInput(formData.poolSupply)
                    : ""
                }
                onChange={handleInputChange}
              />
              <div className="text-xs text-gray-500">
                {t("create.pool_help_text")}
              </div>
              {errors["poolSupply"] && (
                <p className="text-sm text-red-500">{errors["poolSupply"]}</p>
              )}
            </div>

            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="ethAmount">{t("create.eth_amount_label")}</Label>
              <Input
                id="ethAmount"
                name="ethAmount"
                type="number"
                step="0.001"
                placeholder={t("create.placeholder_eth_amount")}
                value={formData.ethAmount || ""}
                onChange={handleInputChange}
              />
              <div className="text-xs text-gray-500">
                {t("create.eth_help_text")}
                {calculatePrice() && (
                    <span className="ml-2 text-blue-600 font-medium">
                      →{" "}
                      {formatPrice(calculatePrice())}{" "}
                      ETH per coin
                    </span>
                  )}
              </div>
              {errors["ethAmount"] && (
                <p className="text-sm text-red-500">{errors["ethAmount"]}</p>
              )}
            </div>
          </>
        )}

        {/* token logo */}
        <div className="space-y-2">
          <Label htmlFor="imageFile">{t("create.coin_image")}</Label>
          <ImageInput onChange={handleImageFileChange} />
          {!imageBuffer && isSubmitted && (
            <p className="text-sm text-red-500">
              {t("create.error_image_required")}
            </p>
          )}
        </div>

        {/* metadata */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataName">{t("create.name")}</Label>
          <Input
            id="metadataName"
            name="metadataName"
            placeholder={t("create.placeholder_coin_name")}
            value={formData.metadataName}
            onChange={handleInputChange}
          />
          {errors["metadataName"] && (
            <p className="text-sm text-red-500">{errors["metadataName"]}</p>
          )}
        </div>

        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataSymbol">{t("create.symbol")}</Label>
          <Input
            id="metadataSymbol"
            name="metadataSymbol"
            placeholder={t("create.placeholder_symbol")}
            value={formData.metadataSymbol}
            onChange={handleInputChange}
          />
          {errors["metadataSymbol"] && (
            <p className="text-sm text-red-500">{errors["metadataSymbol"]}</p>
          )}
        </div>

        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataDescription">{t("create.description")}</Label>
          <Textarea
            id="metadataDescription"
            name="metadataDescription"
            rows={3}
            placeholder={t("create.placeholder_description")}
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
        {formData.mode === "tranche" && (
          <>
            <div className="rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">
                  {t("create.bonding_curve")}
                </h3>
                <TrancheInfoDialog />
              </div>
              <label className="text-sm text-gray-500 mb-4 block">
                {t("create.bonding_curve_help")}
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
                        <stop
                          offset="0%"
                          stopColor="#00e5ff"
                          stopOpacity={0.8}
                        />
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
                <Button type="button" variant="outline" onClick={addTranche}>
                  {t("create.add_tranche")}
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
                    <Label htmlFor={`trancheCoins-${idx}`}>
                      {t("create.coins")}
                    </Label>
                    <Input
                      id={`trancheCoins-${idx}`}
                      type="text"
                      value={formatNumberInput(tranche.coins)}
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
                    <Label htmlFor={`tranchePrice-${idx}`}>
                      {t("create.price_eth")}
                    </Label>
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
          </>
        )}

        {/* Pool Mode Visualization */}
        {formData.mode === "pool" && (
          <div className="bg-card text-card-foreground border-2 border-border shadow-[4px_4px_0_var(--border)] p-6 transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_var(--border)]">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-semibold font-mono">
                {t("create.pool_configuration")}
              </h3>
            </div>

            {/* Main Pool Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-background border-2 border-border p-4 shadow-[2px_2px_0_var(--border)]">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
                  {t("create.pool_supply_display")}
                </div>
                <div className="text-2xl font-bold font-mono">
                  {(formData.poolSupply || 0).toLocaleString()}
                </div>
                <div className="text-xs font-mono text-muted-foreground uppercase">
                  coins
                </div>
              </div>
              
              <div className="bg-background border-2 border-border p-4 shadow-[2px_2px_0_var(--border)]">
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
                  {t("create.eth_liquidity")}
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formData.ethAmount || 0}
                </div>
                <div className="text-xs font-mono text-muted-foreground uppercase">
                  ETH
                </div>
              </div>
            </div>

            {/* Price Calculations - Only show if we have valid data */}
            {formData.poolSupply &&
              formData.ethAmount &&
              formData.ethAmount > 0 &&
              formData.poolSupply > 0 && (
                <>
                  {/* Starting Price & Total Supply */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-background border-2 border-border p-4 shadow-[2px_2px_0_var(--border)]">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
                        {t("create.starting_price")}
                      </div>
                      <div className="text-xl font-bold font-mono">
                        {formatPrice(calculatePrice())}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground uppercase">
                        ETH per coin
                      </div>
                    </div>

                    <div className="bg-background border-2 border-border p-4 shadow-[2px_2px_0_var(--border)]">
                      <div className="text-xs font-mono text-muted-foreground uppercase tracking-wide mb-1">
                        {t("create.total_supply")}
                      </div>
                      <div className="text-xl font-bold font-mono">
                        {(
                          (formData.poolSupply || 0) +
                          (formData.creatorSupply || 0)
                        ).toLocaleString()}
                      </div>
                      <div className="text-xs font-mono text-muted-foreground uppercase">
                        coins
                      </div>
                    </div>
                  </div>

                  {/* Pool Breakdown */}
                  <div className="bg-background border-2 border-border p-4 shadow-[2px_2px_0_var(--border)] mb-4">
                    <div className="text-sm font-mono font-semibold mb-3 uppercase tracking-wide">
                      {t("create.pool_breakdown")}
                    </div>
                    <div className="space-y-2 font-mono text-sm">
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="uppercase tracking-wide">{t("create.pool_liquidity")}</span>
                        <span className="font-bold">
                          {(
                            ((formData.poolSupply || 0) /
                              ((formData.poolSupply || 0) +
                                (formData.creatorSupply || 0))) *
                            100
                          ).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-border pb-1">
                        <span className="uppercase tracking-wide">{t("create.creator_allocation")}</span>
                        <span className="font-bold">
                          {(
                            ((formData.creatorSupply || 0) /
                              ((formData.poolSupply || 0) +
                                (formData.creatorSupply || 0))) *
                            100
                          ).toFixed(1)}%
                        </span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span className="uppercase tracking-wide">{t("create.initial_market_cap")}</span>
                        <span className="font-bold">
                          {formatMarketCap(calculateMarketCap())} ETH
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price Validation Feedback */}
                  {(() => {
                    const price = calculatePrice();
                    const marketCap = calculateMarketCap();

                    if (!price || !marketCap) {
                      return (
                        <div className="bg-background border-2 border-border p-3 shadow-[2px_2px_0_var(--border)] border-gray-400">
                          <div className="text-xs font-mono font-semibold text-gray-600 uppercase tracking-wide">
                            ℹ️ {t("create.enter_pool_help")}
                          </div>
                        </div>
                      );
                    }

                    if (price < 0.000001) {
                      return (
                        <div className="bg-background border-2 border-border p-3 shadow-[2px_2px_0_var(--border)] border-amber-500">
                          <div className="text-xs font-mono font-semibold text-amber-600 uppercase tracking-wide">
                            ⚠ {t("create.low_price_warning")}
                          </div>
                        </div>
                      );
                    }
                    if (marketCap > 100) {
                      return (
                        <div className="bg-background border-2 border-border p-3 shadow-[2px_2px_0_var(--border)] border-amber-500">
                          <div className="text-xs font-mono font-semibold text-amber-600 uppercase tracking-wide">
                            ⚠ {t("create.high_market_cap_warning", {
                              marketCap: formatMarketCap(marketCap),
                            })}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-background border-2 border-border p-3 shadow-[2px_2px_0_var(--border)] border-green-500">
                        <div className="text-xs font-mono font-semibold text-green-600 uppercase tracking-wide">
                          ✓ {t("create.pool_config_good")}
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}

            {/* Empty State */}
            {(!formData.poolSupply ||
              !formData.ethAmount ||
              formData.ethAmount <= 0 ||
              formData.poolSupply <= 0) && (
              <div className="bg-background border-2 border-border p-6 shadow-[2px_2px_0_var(--border)] text-center">
                <div className="text-sm font-mono text-muted-foreground uppercase tracking-wide">
                  {t("create.enter_pool_help")}
                </div>
              </div>
            )}
          </div>
        )}

        {/* submit */}
        <Button type="submit" disabled={isPending} className="mt-2 w-full">
          {isPending
            ? t("create.creating")
            : formData.mode === "simple"
              ? t("create.create_simple_coin")
              : formData.mode === "pool"
                ? t("create.create_coin_with_pool")
                : t("create.launch_coin_sale")}
        </Button>

        {hash && (
          <Alert className="mt-4">
            <AlertTitle>{t("create.success_transaction_sent")}</AlertTitle>
            <AlertDescription>
              {t("create.success_check_hash", { hash })}
            </AlertDescription>
          </Alert>
        )}

        {launchId ? (
          <Alert className="mt-4">
            <AlertTitle>{t("create.success_launch_id")}</AlertTitle>
            <AlertDescription>
              {t("create.success_check_launch_id", { coinId: launchId })}
              <Link to="/c/$coinId" params={{ coinId: launchId.toString() }}>
                {t("create.success_view_coin", {
                  coinId: launchId.toString(),
                })}
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>{t("create.error_title")}</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </div>
    </form>
  );
};
