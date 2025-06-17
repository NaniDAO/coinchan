import { useMemo, useState, ChangeEvent } from "react";
import { useWriteContract, useAccount } from "wagmi";
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

import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line, Area } from "recharts";
import { parseEther } from "viem";
import { toast } from "sonner";
import { generateRandomSlug, formatNumberInput, handleNumberInputChange } from "@/lib/utils";
import { XIcon } from "lucide-react";

const defaultTranche = {
  coins: 300000000,
  price: 1,
};

type LaunchMode = "simple" | "tranche" | "pool";

const CoinIcon = () => (
  <svg width="24" height="29" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" className="inline-block">
    <path d="M100,120 L100,30 A90,90 0 0,1 177.9,75 Z" fill="#FF6B9D" stroke="#000000" stroke-width="2" />
    <path d="M100,120 L177.9,75 A90,90 0 0,1 177.9,165 Z" fill="#00D4FF" stroke="#000000" stroke-width="2" />
    <path d="M100,120 L177.9,165 A90,90 0 0,1 100,210 Z" fill="#66D9A6" stroke="#000000" stroke-width="2" />
    <path d="M100,120 L100,210 A90,90 0 0,1 22.1,165 Z" fill="#B967DB" stroke="#000000" stroke-width="2" />
    <path d="M100,120 L22.1,165 A90,90 0 0,1 22.1,75 Z" fill="#FF9F40" stroke="#000000" stroke-width="2" />
    <path d="M100,120 L22.1,75 A90,90 0 0,1 100,30 Z" fill="#FFE066" stroke="#000000" stroke-width="2" />
  </svg>
);

const ChartIcon = () => (
  <svg width="24" height="29" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" className="inline-block">
    <line x1="30" y1="200" x2="170" y2="200" stroke="#000000" stroke-width="2" />
    <line x1="40" y1="40" x2="40" y2="200" stroke="#000000" stroke-width="2" />
    <line x1="40" y1="120" x2="170" y2="120" stroke="#000000" stroke-width="1" stroke-dasharray="4,4" />
    <line x1="40" y1="160" x2="170" y2="160" stroke="#000000" stroke-width="1" stroke-dasharray="4,4" />
    <rect x="55" y="160" width="20" height="40" fill="#FF6B9D" stroke="#000000" stroke-width="2" />
    <rect x="85" y="120" width="20" height="80" fill="#00D4FF" stroke="#000000" stroke-width="2" />
    <rect x="115" y="90" width="20" height="110" fill="#FFE066" stroke="#000000" stroke-width="2" />
    <rect x="145" y="50" width="20" height="150" fill="#66D9A6" stroke="#000000" stroke-width="2" />
  </svg>
);

const PoolIcon = () => (
  <svg width="24" height="29" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" className="inline-block">
    <path
      d="M100,20 
             C135,70 160,110 160,160 
             C160,200 130,220 100,220 
             C70,220 40,200 40,160 
             C40,110 65,70 100,20 Z"
      fill="#AEEFFF"
      stroke="#000000"
      stroke-width="2"
    />
    <g transform="translate(50,90) scale(0.5)">
      <path d="M100,120 L100,30 A90,90 0 0,1 177.9,75 Z" fill="#FF6B9D" stroke="#000000" stroke-width="2" />
      <path d="M100,120 L177.9,75 A90,90 0 0,1 177.9,165 Z" fill="#00D4FF" stroke="#000000" stroke-width="2" />
      <path d="M100,120 L177.9,165 A90,90 0 0,1 100,210 Z" fill="#66D9A6" stroke="#000000" stroke-width="2" />
      <path d="M100,120 L100,210 A90,90 0 0,1 22.1,165 Z" fill="#B967DB" stroke="#000000" stroke-width="2" />
      <path d="M100,120 L22.1,165 A90,90 0 0,1 22.1,75 Z" fill="#FF9F40" stroke="#000000" stroke-width="2" />
      <path d="M100,120 L22.1,75 A90,90 0 0,1 100,30 Z" fill="#FFE066" stroke="#000000" stroke-width="2" />
    </g>
  </svg>
);

// Note: LAUNCH_MODES will be moved inside component to access translations
const getLaunchModes = (t: any) => ({
  simple: {
    id: "simple",
    title: t("create.simple_coin_title"),
    description: t("create.simple_coin_description"),
    icon: <CoinIcon />,
  },
  tranche: {
    id: "tranche",
    title: t("create.tranche_sale_title"),
    description: t("create.tranche_sale_description"),
    icon: <ChartIcon />,
  },
  pool: {
    id: "pool",
    title: t("create.coin_with_pool_title"),
    description: t("create.coin_with_pool_description"),
    icon: <PoolIcon />,
  },
});

// Validation schema with zod
const launchFormSchema = z
  .object({
    mode: z.enum(["simple", "tranche", "pool"]).default("tranche"),
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
        return data.poolSupply && data.poolSupply > 0 && data.ethAmount && data.ethAmount > 0;
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
  const { address: account } = useAccount();
  const { t } = useTranslation();

  const LAUNCH_MODES = getLaunchModes(t);

  // State for form data instead of react-hook-form
  const [formData, setFormData] = useState<LaunchFormValues>({
    mode: "tranche",
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

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  const handleTrancheChange = (index: number, field: "coins" | "price", value: string) => {
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
            (Number(defaultTranche.price) + prev.tranches.length * Number(defaultTranche.price)).toFixed(2),
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

    try {
      // Validate with zod
      const validatedData = launchFormSchema.parse(formData);
      setErrors({});

      if (!imageBuffer) {
        toast.error(t("create.error_select_image"));
        return;
      }

      const unlockTs = validatedData.creatorUnlockDate
        ? Math.floor(new Date(validatedData.creatorUnlockDate).getTime() / 1_000)
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

      if (validatedData.mode === "simple") {
        // Use simple coin function from Cookbook
        if (!account) {
          toast.error(t("create.error_connect_wallet"));
          return;
        }
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
        const trancheCoins = validatedData.tranches.map((t) => parseEther(t.coins.toString()));
        const tranchePrices = validatedData.tranches.map((t) => parseEther(t.price.toString()));

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
        toast.error(`${t("create.error_failed_launch")}: ${err instanceof Error ? err.message : String(err)}`);
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
    <form onSubmit={onSubmit} className="grid grid-cols-1 space-x-2 p-4 min-h-screeen mb-20 mx-auto">
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
          {errors["creatorSupply"] && <p className="text-sm text-red-500">{errors["creatorSupply"]}</p>}
        </div>

        {/* Creator Unlock Time - only show for tranche and pool modes */}
        {(formData.mode === "tranche" || formData.mode === "pool") && (
          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="creatorUnlockDate">{t("create.creator_unlock_time")}</Label>
            <Input
              id="creatorUnlockDate"
              name="creatorUnlockDate"
              type="datetime-local"
              value={formData.creatorUnlockDate}
              onChange={handleInputChange}
            />
            {errors["creatorUnlockDate"] && <p className="text-sm text-red-500">{errors["creatorUnlockDate"]}</p>}
          </div>
        )}

        {/* Launch Mode Selector */}
        <div className="grid w-full items-center gap-3">
          <Label className="text-base font-semibold">{t("create.launch_type")}</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.values(LAUNCH_MODES).map((mode) => (
              <label
                key={mode.id}
                className={`relative flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                  formData.mode === mode.id
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="mode"
                  value={mode.id}
                  checked={formData.mode === mode.id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, mode: e.target.value as LaunchMode }))}
                  className="sr-only"
                />
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{mode.icon}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{mode.title}</div>
                    <div className="text-xs text-gray-600 mt-1">{mode.description}</div>
                  </div>
                  {formData.mode === mode.id && (
                    <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full"></div>
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
          {errors["mode"] && <p className="text-sm text-red-500">{errors["mode"]}</p>}
        </div>

        {/* Pool Mode Inputs */}
        {formData.mode === "pool" && (
          <>
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="poolSupply">{t("create.pool_supply_label")}</Label>
              <Input
                id="poolSupply"
                name="poolSupply"
                type="text"
                placeholder="e.g. 900,000,000"
                value={formData.poolSupply ? formatNumberInput(formData.poolSupply) : ""}
                onChange={handleInputChange}
              />
              <div className="text-xs text-gray-500">{t("create.pool_help_text")}</div>
              {errors["poolSupply"] && <p className="text-sm text-red-500">{errors["poolSupply"]}</p>}
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
                {formData.poolSupply && formData.ethAmount && formData.ethAmount > 0 && (
                  <span className="ml-2 text-blue-600 font-medium">
                    → {((formData.ethAmount || 0) / (formData.poolSupply || 1)).toFixed(8)} ETH per token
                  </span>
                )}
              </div>
              {errors["ethAmount"] && <p className="text-sm text-red-500">{errors["ethAmount"]}</p>}
            </div>
          </>
        )}

        {/* token logo */}
        <div className="space-y-2">
          <Label htmlFor="imageFile">{t("create.coin_image")}</Label>
          <ImageInput onChange={handleImageFileChange} />
          {!imageBuffer && isSubmitted && <p className="text-sm text-red-500">{t("create.error_image_required")}</p>}
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
          {errors["metadataName"] && <p className="text-sm text-red-500">{errors["metadataName"]}</p>}
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
          {errors["metadataSymbol"] && <p className="text-sm text-red-500">{errors["metadataSymbol"]}</p>}
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
          {errors["metadataDescription"] && <p className="text-sm text-red-500">{errors["metadataDescription"]}</p>}
        </div>
      </div>
      <div className="space-y-2">
        {/* ----- bonding curve visual + tranche editor ----- */}
        {formData.mode === "tranche" && (
          <>
            <div className="rounded-2xl shadow-sm p-4">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-lg font-semibold">{t("create.bonding_curve")}</h3>
                <TrancheInfoDialog />
              </div>
              <label className="text-sm text-gray-500 mb-4 block">{t("create.bonding_curve_help")}</label>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.8} />
                        <stop offset="100%" stopColor="#00e5ff" stopOpacity={0.2} />
                      </linearGradient>
                      <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#00e5ff" />
                        <stop offset="100%" stopColor="#4dd0e1" />
                      </linearGradient>
                    </defs>

                    <CartesianGrid horizontal={true} vertical={false} stroke="#e2e8f0" strokeDasharray="1 4" />

                    <XAxis
                      dataKey="name"
                      axisLine={{ stroke: "#cbd5e0" }}
                      tickLine={false}
                      tick={{ fill: "#4a5568", fontSize: 12 }}
                    />

                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#4a5568", fontSize: 12 }} />

                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-white p-2 rounded shadow-lg text-sm">
                            <div className="text-gray-600 mb-1">{label}</div>
                            <div className="font-medium text-blue-500">
                              {typeof payload[0]?.value === "number" ? payload[0].value.toFixed(4) : payload[0]?.value}{" "}
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
                      onClick={(_d, idx) => handleBarClick(chartData[idx].originalIndex)}
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
                <div key={idx} className="flex flex-col sm:flex-row items-end gap-4 pb-4 last:pb-0">
                  <div className="flex-grow grid w-full items-center gap-1.5">
                    <Label htmlFor={`trancheCoins-${idx}`}>{t("create.coins")}</Label>
                    <Input
                      id={`trancheCoins-${idx}`}
                      type="text"
                      value={formatNumberInput(tranche.coins)}
                      onChange={(e) => handleTrancheChange(idx, "coins", e.target.value)}
                    />
                    {errors[`tranches.${idx}.coins`] && (
                      <p className="text-sm text-red-500">{errors[`tranches.${idx}.coins`]}</p>
                    )}
                  </div>
                  <div className="flex-grow grid w-full items-center gap-1.5">
                    <Label htmlFor={`tranchePrice-${idx}`}>{t("create.price_eth")}</Label>
                    <Input
                      id={`tranchePrice-${idx}`}
                      type="number"
                      value={tranche.price}
                      onChange={(e) => handleTrancheChange(idx, "price", e.target.value)}
                    />
                    {errors[`tranches.${idx}.price`] && (
                      <p className="text-sm text-red-500">{errors[`tranches.${idx}.price`]}</p>
                    )}
                  </div>
                  {formData.tranches.length > 1 && (
                    <Button variant="destructive" size="sm" onClick={() => removeTranche(idx)} type="button">
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
          <div className="rounded-2xl shadow-sm p-4">
            <h3 className="text-lg font-semibold mb-1">{t("create.pool_configuration")}</h3>
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">{t("create.pool_supply_display")}</span>
                  <div className="text-lg font-bold text-blue-600">
                    {(formData.poolSupply || 0).toLocaleString()} {t("create.tokens")}
                  </div>
                </div>
                <div>
                  <span className="font-medium">{t("create.eth_liquidity")}</span>
                  <div className="text-lg font-bold text-blue-600">{formData.ethAmount || 0} ETH</div>
                </div>
              </div>

              {/* Enhanced Price Calculations */}
              {formData.poolSupply && formData.ethAmount && formData.ethAmount > 0 && formData.poolSupply > 0 && (
                <div className="mt-4 space-y-3 border-t border-blue-200 dark:border-blue-800 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("create.starting_price")}
                      </span>
                      <div className="text-xl font-bold text-blue-600">
                        {((formData.ethAmount || 0) / (formData.poolSupply || 1)).toFixed(8)} ETH
                      </div>
                      <div className="text-xs text-gray-500">{t("create.per_token")}</div>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t("create.total_supply")}
                      </span>
                      <div className="text-xl font-bold text-blue-600">
                        {((formData.poolSupply || 0) + (formData.creatorSupply || 0)).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">{t("create.tokens")}</div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 p-3 rounded-lg">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {t("create.pool_breakdown")}
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>{t("create.pool_liquidity")}</span>
                        <span className="font-medium">
                          {(
                            ((formData.poolSupply || 0) /
                              ((formData.poolSupply || 0) + (formData.creatorSupply || 0))) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("create.creator_allocation")}</span>
                        <span className="font-medium">
                          {(
                            ((formData.creatorSupply || 0) /
                              ((formData.poolSupply || 0) + (formData.creatorSupply || 0))) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("create.initial_market_cap")}</span>
                        <span className="font-medium">
                          {(
                            ((formData.ethAmount || 0) / (formData.poolSupply || 1)) *
                            ((formData.poolSupply || 0) + (formData.creatorSupply || 0))
                          ).toFixed(4)}{" "}
                          ETH
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Price Validation Feedback */}
                  {(() => {
                    const price = (formData.ethAmount || 0) / (formData.poolSupply || 1);
                    const marketCap = price * ((formData.poolSupply || 0) + (formData.creatorSupply || 0));

                    if (price < 0.000001) {
                      return (
                        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                          {t("create.low_price_warning")}
                        </div>
                      );
                    }
                    if (marketCap > 100) {
                      return (
                        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                          {t("create.high_market_cap_warning", { marketCap: marketCap.toFixed(2) })}
                        </div>
                      );
                    }
                    return (
                      <div className="text-xs text-green-600 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                        {t("create.pool_config_good")}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Empty State */}
              {(!formData.poolSupply || !formData.ethAmount || formData.ethAmount <= 0 || formData.poolSupply <= 0) && (
                <div className="mt-4 text-center text-gray-500 text-sm p-4 border-t border-blue-200 dark:border-blue-800">
                  {t("create.enter_pool_help")}
                </div>
              )}
            </div>
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
            <AlertDescription>{t("create.success_check_hash", { hash })}</AlertDescription>
          </Alert>
        )}
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
