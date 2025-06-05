import React, { useState, FormEvent } from "react";
import { useWriteContract } from "wagmi";
import { ZAMMLaunchAddress, ZAMMLaunchAbi } from "@/constants/ZAMMLaunch"; // Ensure these are correctly defined
import { pinImageToPinata, pinJsonToPinata } from "@/lib/pinata"; // Ensure these utilities exist and work

// Import shadcn components
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Optional: for success/error messages

// Helper to convert File to Buffer
const fileToBuffer = (file: File): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(Buffer.from(reader.result));
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

interface Tranche {
  coins: string; // Use string to handle large numbers from input
  price: string; // Use string to handle large numbers from input
}

export const LaunchForm = () => {
  const [creatorSupply, setCreatorSupply] = useState("");
  const [creatorUnlockDate, setCreatorUnlockDate] = useState<string>(""); // Use string for date input
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [tranches, setTranches] = useState<Tranche[]>([
    { coins: "", price: "" },
  ]);
  const [metadataName, setMetadataName] = useState("");
  const [metadataDescription, setMetadataDescription] = useState("");

  const { data: hash, error, isPending, writeContract } = useWriteContract();

  const handleAddTranche = () => {
    setTranches([...tranches, { coins: "", price: "" }]);
  };

  const handleRemoveTranche = (index: number) => {
    setTranches(tranches.filter((_, i) => i !== index));
  };

  const handleTrancheChange = (
    index: number,
    field: keyof Tranche,
    value: string,
  ) => {
    const newTranches = tranches.map((tranche, i) =>
      i === index ? { ...tranche, [field]: value } : tranche,
    );
    setTranches(newTranches);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!imageFile) {
      alert("Please select an image file."); // Consider using a shadcn Dialog or Toast for this
      return;
    }

    if (tranches.length === 0) {
      alert("Please add at least one tranche."); // Consider using a shadcn Dialog or Toast for this
      return;
    }

    // Convert date string to Unix timestamp (seconds)
    const unlockTimestamp = creatorUnlockDate
      ? Math.floor(new Date(creatorUnlockDate).getTime() / 1000)
      : 0;

    // Prepare Pinata metadata
    const pinataMetadata = {
      name: imageFile.name,
    };

    try {
      // Upload image to Pinata
      const imageBuffer = await fileToBuffer(imageFile);
      const imageHash = await pinImageToPinata(
        imageBuffer,
        imageFile.name,
        pinataMetadata,
      );
      const imageUrl = `ipfs://${imageHash}`; // Construct IPFS URI

      // Prepare token URI JSON
      const tokenUriJson = {
        name: metadataName || imageFile.name,
        description: metadataDescription || "",
        image: imageUrl,
        // Add other metadata fields as needed for ERC-6909 or similar standards
      };

      // Upload JSON to Pinata
      const tokenUriHash = await pinJsonToPinata(tokenUriJson);
      const uri = `ipfs://${tokenUriHash}`; // Construct IPFS URI for the metadata

      // Prepare tranche data for contract call
      const trancheCoins = tranches.map((t) => BigInt(t.coins));
      const tranchePrice = tranches.map((t) => BigInt(t.price));

      // Prepare other arguments for contract call
      const creatorSupplyBigInt = BigInt(creatorSupply || 0);
      const creatorUnlockBigInt = BigInt(unlockTimestamp); // Timestamp is uint256

      writeContract({
        abi: ZAMMLaunchAbi,
        address: ZAMMLaunchAddress,
        functionName: "launch",
        args: [
          creatorSupplyBigInt,
          creatorUnlockBigInt,
          uri,
          trancheCoins,
          tranchePrice,
        ],
      });
    } catch (e) {
      console.error("Error during form submission or Pinata upload:", e);
      // Consider using a shadcn Toast for this
      alert(`Failed to launch: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4 max-w-md mx-auto">
      {" "}
      {/* Added some padding and max-width */}
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="creatorSupply">Creator Supply (uint96)</Label>
        <Input
          type="number"
          id="creatorSupply"
          value={creatorSupply}
          onChange={(e) => setCreatorSupply(e.target.value)}
          placeholder="e.g., 1000000"
          required
        />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="creatorUnlock">Creator Unlock Time (Date/Time)</Label>
        <Input
          type="datetime-local"
          id="creatorUnlock"
          value={creatorUnlockDate}
          onChange={(e) => setCreatorUnlockDate(e.target.value)}
        />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="metadataName">Metadata Name</Label>
        <Input
          type="text"
          id="metadataName"
          value={metadataName}
          onChange={(e) => setMetadataName(e.target.value)}
          placeholder="e.g., My Awesome Coin"
          required
        />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="metadataDescription">Metadata Description</Label>
        <Textarea
          id="metadataDescription"
          value={metadataDescription}
          onChange={(e) => setMetadataDescription(e.target.value)}
          rows={3}
          placeholder="A brief description of the coin"
        />
      </div>
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor="imageFile">Coin Image (for URI)</Label>
        {/* shadcn Input doesn't style type="file" well, keeping native with minimal classes */}
        <input
          type="file"
          id="imageFile"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] || null)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          required
        />
      </div>
      <Card>
        {" "}
        {/* Use Card for the Tranches section */}
        <CardHeader>
          <CardTitle>Tranches</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {" "}
          {/* Applied space-y to content */}
          {tranches.map((tranche, index) => (
            <div
              key={index}
              className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4 items-end border-b pb-4 last:border-b-0 last:pb-0"
            >
              {" "}
              {/* Added flex-col for small screens, border/padding for separation */}
              <div className="flex-grow grid w-full items-center gap-1.5">
                <Label htmlFor={`trancheCoins-${index}`}>
                  Tranche Coins (uint96)
                </Label>
                <Input
                  type="number"
                  id={`trancheCoins-${index}`}
                  value={tranche.coins}
                  onChange={(e) =>
                    handleTrancheChange(index, "coins", e.target.value)
                  }
                  required
                />
              </div>
              <div className="flex-grow grid w-full items-center gap-1.5">
                <Label htmlFor={`tranchePrice-${index}`}>
                  Tranche Price (ETH in wei, uint96)
                </Label>
                <Input
                  type="number"
                  id={`tranchePrice-${index}`}
                  value={tranche.price}
                  onChange={(e) =>
                    handleTrancheChange(index, "price", e.target.value)
                  }
                  required
                />
              </div>
              {tranches.length > 1 && (
                <Button
                  type="button"
                  variant="destructive" // Using destructive variant for remove
                  size="sm" // Using small size button
                  onClick={() => handleRemoveTranche(index)}
                  className="w-full sm:w-auto" // Make button full width on small screens
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </CardContent>
        <CardFooter className="flex justify-end pt-4">
          {" "}
          {/* Use CardFooter for button */}
          <Button
            type="button"
            variant="outline" // Using outline variant for add
            onClick={handleAddTranche}
          >
            Add Tranche
          </Button>
        </CardFooter>
      </Card>
      <Button
        type="submit"
        disabled={isPending}
        className="w-full" // Make button full width
      >
        {isPending ? "Launching..." : "Launch Coin Sale"}
      </Button>
      {hash && (
        <Alert className="mt-4">
          {" "}
          {/* Use Alert for success message */}
          <AlertTitle>Transaction Sent!</AlertTitle>
          <AlertDescription>Check transaction hash: {hash}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="mt-4">
          {" "}
          {/* Use Alert for error message */}
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
};
