import confetti from "canvas-confetti";
import { useState, useEffect, useRef, ChangeEvent, DragEvent } from "react";
import { CoinchanAbi, CoinchanAddress } from "./constants/Coinchan";
import { useAccount, useWriteContract } from "wagmi";
import { parseEther } from "viem";
import { pinImageToPinata, pinJsonToPinata } from "./utils/pinata";
import { handleWalletError, isUserRejectionError } from "./utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

// Define proper types for the ImageInput component
interface ImageInputProps {
  onChange: (file: File | File[] | undefined) => void;
}

// Fixed ImageInput component with drag and drop and preview
const ImageInput = ({ onChange }: ImageInputProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
      // Reset the input value to ensure onChange fires even if the same file is selected again
      e.target.value = '';
    }
  };

  const handleFile = (file: File) => {
    setSelectedFileName(file.name);
    
    // Create preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    
    // Call parent onChange handler
    onChange(file);
    
    // Clean up the preview URL when component unmounts
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  };
  
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files?.length) {
      handleFile(files[0]);
    }
  };

  // Clean up the URL when component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);
  
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <div 
        className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-md ${
          isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
        } transition-colors duration-200`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {previewUrl ? (
          <div className="flex flex-col items-center gap-4">
            <img 
              src={previewUrl} 
              alt="Preview" 
              className="max-h-32 max-w-full object-contain rounded-md" 
            />
            <div className="flex flex-col items-center">
              <p className="text-sm text-gray-500 mb-2">{selectedFileName}</p>
              <Button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                Change Image
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-2">Drag & drop image here</p>
            <p>or</p>
            <Button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="mt-2"
            >
              Browse Files
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export function CoinForm({
  onMemepaperClick,
}: {
  onMemepaperClick: () => void;
}) {
  const [formState, setFormState] = useState({
    name: "",
    symbol: "",
    description: "",
    logo: "",
    creatorSupply: "0",
    ethAmount: "0.01", // Default ETH amount
  });

  const [imageBuffer, setImageBuffer] = useState<ArrayBuffer | null>(null);
  const { address } = useAccount();

  const TOTAL_SUPPLY = 21000000;
  const [poolSupply, setPoolSupply] = useState(TOTAL_SUPPLY);
  const swapFee = 100;
  const vestingDuration = 15778476;
  const vesting = true;

  useEffect(() => {
    const creatorAmount = Number(formState.creatorSupply) || 0;
    const safeCreatorAmount = Math.min(creatorAmount, TOTAL_SUPPLY);
    setPoolSupply(TOTAL_SUPPLY - safeCreatorAmount);
  }, [formState.creatorSupply]);

  const { writeContract, isPending, isSuccess, data, error } = useWriteContract();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!address || !imageBuffer) {
      // Error will be shown in UI
      setErrorMessage(!address ? "Wallet not connected" : "Please upload an image");
      return;
    }
    
    // Validate ETH amount
    const ethAmount = Number(formState.ethAmount);
    if (isNaN(ethAmount) || ethAmount <= 0) {
      setErrorMessage("Please enter a valid ETH amount greater than 0");
      return;
    }

    const creatorSupplyValue = Number(formState.creatorSupply) || 0;
    const safeCreatorSupply = Math.min(creatorSupplyValue, TOTAL_SUPPLY);
    const finalPoolSupply = TOTAL_SUPPLY - safeCreatorSupply;

    try {
      const fileName = `${formState.name}_logo.png`;
      const pinataMetadata = { name: fileName };

      const imageHash = await pinImageToPinata(
        imageBuffer,
        fileName,
        pinataMetadata,
      );

      const tokenUriJson = {
        name: formState.name,
        symbol: formState.symbol,
        description: formState.description,
        image: imageHash,
      };

      const tokenUriHash = await pinJsonToPinata(tokenUriJson);

      try {
        // Use custom ETH amount from form or default to 0.01 if invalid
        const ethAmount = formState.ethAmount && !isNaN(Number(formState.ethAmount)) 
          ? formState.ethAmount 
          : "0.01";
          
        writeContract({
          address: CoinchanAddress,
          abi: CoinchanAbi,
          functionName: "makeLocked",
          value: parseEther(ethAmount),
          args: [
            formState.name,
            formState.symbol,
            tokenUriHash,
            parseEther(finalPoolSupply.toString()),
            parseEther(safeCreatorSupply.toString()),
            BigInt(swapFee),
            address,
            BigInt(Math.floor(Date.now() / 1000) + vestingDuration),
            vesting,
          ],
        });

        // Show confetti only if the transaction was successful
        if (!isUserRejectionError(error)) {
          confetti({
            particleCount: 666,
            spread: 666,
            scalar: 0.9,
            shapes: ["circle"],
            gravity: 0.9,
            colors: ["#f9bd20", "#c17a00", "#fff9e6"],
          });
        }
      } catch (txError) {
        // Handle wallet rejection silently
        if (!isUserRejectionError(txError)) {
          const errorMsg = handleWalletError(txError);
          if (errorMsg) {
            setErrorMessage(errorMsg);
          }
        }
      }
    } catch (pinataError) {
      // Error will be shown in UI
      setErrorMessage("Failed to upload image to IPFS. Please try again.");
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormState({
      ...formState,
      [e.target.name]: e.target.value,
    });
  };

  const handleFileChange = (value: File | File[] | undefined) => {
    if (value && !Array.isArray(value)) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageBuffer(e.target?.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(value);
    }
  };

  return (
    <div className="border-2 border-[#b01e0e] rounded-lg p-5">
      <div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              name="name"
              value={formState.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              type="text"
              name="symbol"
              value={formState.symbol}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formState.description}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="creatorSupply">Creator Supply</Label>
            <Input
              id="creatorSupply"
              type="text"
              name="creatorSupply"
              placeholder="0"
              value={formState.creatorSupply}
              onChange={handleChange}
            />
            <p className="text-sm text-gray-500">
              Pool Supply: {poolSupply.toLocaleString()} (Total: {TOTAL_SUPPLY.toLocaleString()})
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <ImageInput onChange={handleFileChange} />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="ethAmount">ETH Amount</Label>
            <Input
              id="ethAmount"
              type="text"
              name="ethAmount"
              placeholder="0.01"
              value={formState.ethAmount}
              onChange={handleChange}
            />
            <p className="text-sm text-gray-500">
              Default is 0.01 ETH
            </p>
          </div>

          <p>
            Read the{" "}
            <a href="#" onClick={onMemepaperClick}>
              coinpaper
            </a>{" "}
            to learn more.
          </p>

          <Button disabled={isPending} type="submit">
            {isPending ? "Check Wallet" : "Coin It!"}
          </Button>

          {errorMessage && (
            <div className="text-sm text-red-600 mt-2">{errorMessage}</div>
          )}
          
          {isSuccess && <div className="text-sm text-green-600 mt-2">Success! Transaction: {JSON.stringify(data)}</div>}
        </form>
      </div>
    </div>
  );
}
