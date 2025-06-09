import { useState, FormEvent, useMemo } from "react";
import { useWriteContract } from "wagmi";
import { ZAMMLaunchAddress, ZAMMLaunchAbi } from "@/constants/ZAMMLaunch";
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata";

// shadcn components
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ImageInput } from "@/components/ui/image-input";

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
} from "recharts";
import { parseEther } from "viem";
import { toast } from "sonner";
import { generateRandomSlug } from "@/lib/utils";
interface Tranche {
  coins: string; // uint96 as string
  price: string; // ETH (or wei) as string
}

export const LaunchForm = () => {
  const [creatorSupply, setCreatorSupply] = useState("");
  const [creatorUnlockDate, setCreatorUnlockDate] = useState<string>("");
  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const [tranches, setTranches] = useState<Tranche[]>([
    { coins: "", price: "" },
  ]);
  const [metadataName, setMetadataName] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");

  const { data: hash, error, isPending, writeContract } = useWriteContract();

  /* ---------- bonding‑curve helpers ---------- */
  const chartData = useMemo(() => {
    // map + keep original index so we can update state later
    return tranches
      .map((t, i) => ({
        originalIndex: i,
        priceNum: parseFloat(t.price || "0"),
        name: `T${i + 1}`,
      }))
      .sort((a, b) => a.priceNum - b.priceNum);
  }, [tranches]);

  const handleBarClick = (originalIndex: number) => {
    const current = tranches[originalIndex]?.price || "0";
    const next = prompt("Enter new price for this tranche (ETH)", current);
    if (next !== null) {
      handleTrancheChange(originalIndex, "price", next);
    }
  };

  /* ---------- form state helpers ---------- */
  const handleAddTranche = () =>
    setTranches([...tranches, { coins: "", price: "" }]);
  const handleRemoveTranche = (idx: number) =>
    setTranches(tranches.filter((_, i) => i !== idx));
  const handleTrancheChange = (
    idx: number,
    field: keyof Tranche,
    value: string,
  ) =>
    setTranches(
      tranches.map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    );

  const handleImageFileChange = (value: File | File[] | undefined) => {
    if (value && !Array.isArray(value)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBuffer(e.target?.result as ArrayBuffer);
        // const blob = new Blob([e.target?.result as ArrayBuffer], {
        //   type: value.type,
        // });
        // const url = URL.createObjectURL(blob);
        // setPreviewUrl(url);
      };
      reader.readAsArrayBuffer(value);
    }
  };

  /* ---------- submit ---------- */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!imageBuffer) return alert("Select an image file");
    if (!tranches.length) return alert("Add at least one tranche");

    const unlockTs = creatorUnlockDate
      ? Math.floor(new Date(creatorUnlockDate).getTime() / 1_000)
      : 0;

    try {
      const fileName = `${generateRandomSlug()}_logo.png`;

      const imgUri = await pinImageToPinata(imageBuffer, fileName, {
        name: fileName,
      });

      const uri = await pinJsonToPinata({
        name: metadataName || fileName,
        symbol: metadataSymbol,
        description: metadataDescription,
        image: imgUri,
      });

      const trancheCoins = tranches.map((t) => parseEther(t.coins));
      const tranchePrices = tranches.map((t) => parseEther(t.price));

      writeContract({
        abi: ZAMMLaunchAbi,
        address: ZAMMLaunchAddress,
        functionName: "launch",
        args: [
          parseEther(creatorSupply) ?? 0n,
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

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-2 space-x-2 p-4 w-screen mx-auto"
    >
      <div className="space-y-2">
        {/* creator supply & unlock */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="creatorSupply">Creator Supply (uint96)</Label>
          <Input
            id="creatorSupply"
            type="number"
            value={creatorSupply}
            onChange={(e) => setCreatorSupply(e.target.value)}
            placeholder="e.g. 1000000"
            required
          />
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="creatorUnlock">Creator Unlock Time</Label>
          <Input
            id="creatorUnlock"
            type="datetime-local"
            value={creatorUnlockDate}
            onChange={(e) => setCreatorUnlockDate(e.target.value)}
          />
        </div>

        {/* token logo */}
        <div className="space-y-2">
          <Label htmlFor="imageFile">Coin Image</Label>
          <ImageInput onChange={handleImageFileChange} />
        </div>

        {/* metadata */}
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataName"> Name</Label>
          <Input
            id="metadataName"
            value={metadataName}
            onChange={(e) => setMetadataName(e.target.value)}
            placeholder="My Awesome Coin"
            required
          />
        </div>
        <div className="grid w-full items-center gap-1.5">
          <Label htmlFor="metadataDescription">Description</Label>
          <Textarea
            id="metadataDescription"
            rows={3}
            value={metadataDescription}
            onChange={(e) => setMetadataDescription(e.target.value)}
            placeholder="A brief description of the coin"
          />
        </div>
      </div>
      <div className="space-y-2">
        {/* ----- bonding curve visual + tranche editor ----- */}
        <div>
          <h3>Bonding Curve – Click bars to edit price</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart /* Bar + line in one go */
                data={chartData}
                margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />

                {/* bars stay interactive */}
                <Bar
                  dataKey="priceNum"
                  fill="#000"
                  onClick={(_d, idx) =>
                    handleBarClick(chartData[idx].originalIndex)
                  }
                />

                {/* cyan curve on top of the bars */}
                <Line
                  type="monotone"
                  dataKey="priceNum"
                  stroke="#00e5ff" // or whatever hex you like
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false} // makes editing snappier
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={handleAddTranche}>
              Add Tranche
            </Button>
          </div>
        </div>

        {/* tranche raw inputs – allow granular control + coins */}
        {tranches.map((tranche, idx) => (
          <div
            key={idx}
            className="flex flex-col sm:flex-row items-end gap-4 border-b pb-4 last:border-b-0 last:pb-0"
          >
            <div className="flex-grow grid w-full items-center gap-1.5">
              <Label htmlFor={`trancheCoins-${idx}`}>Coins (uint96)</Label>
              <Input
                id={`trancheCoins-${idx}`}
                type="number"
                value={tranche.coins}
                onChange={(e) =>
                  handleTrancheChange(idx, "coins", e.target.value)
                }
                required
              />
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
                required
              />
            </div>
            {tranches.length > 1 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleRemoveTranche(idx)}
              >
                Remove
              </Button>
            )}
          </div>
        ))}

        {/* submit */}
        <Button type="submit" disabled={isPending} className="w-full">
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
