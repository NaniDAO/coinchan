import { useState, useMemo } from "react";
import type React from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { DaicoAbi, DaicoAddress } from "@/constants/DAICO";
import { useEthUsdPrice } from "@/hooks/use-eth-usd-price";
import { parseUnits, parseEther, Address } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  Plus,
  Trash2,
  Coins,
  Users,
  TrendingUp,
  Droplet,
  Shield,
  Calendar,
  DollarSign,
  Info,
  Twitter,
  MessageCircle,
  Hash,
  Globe,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getEtherscanTxUrl } from "@/lib/explorer";
import { pinJsonToPinata, pinImageToPinata } from "@/lib/pinata";
import { Badge } from "@/components/ui/badge";
import { ImageInput } from "@/components/ui/image-input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

// Default addresses from user
const DEFAULT_SUMMON_CONFIG = {
  summoner: "0x0000000000330B8df9E3bc5E553074DA58eE9138" as Address,
  molochImpl: "0x643A45B599D81be3f3A68F37EB3De55fF10673C1" as Address,
  sharesImpl: "0x71E9b38d301b5A58cb998C1295045FE276Acf600" as Address,
  lootImpl: "0x6f1f2aF76a3aDD953277e9F369242697C87bc6A5" as Address,
};

// Feature info for hover cards
const FEATURE_INFO = {
  governance: {
    title: "Token Governance",
    description:
      "Token holders can vote on proposals to control the DAO. Each token represents voting power, allowing the community to make decisions about fund allocation, parameter changes, and other governance matters.",
  },
  passiveIncome: {
    title: "Operator Passive Income",
    description:
      "The tap mechanism allows funds to be released gradually to an operator address over time. Token holders can vote to adjust or freeze the tap rate, ensuring accountability and controlled spending.",
  },
  autoLP: {
    title: "Auto LP",
    description:
      "Automatically create a liquidity pool with a portion of raised funds. This ensures immediate trading liquidity for your token while maintaining price stability through decentralized market-making.",
  },
};

function FeaturePill({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <Badge
          variant="secondary"
          className="px-4 py-1.5 text-sm font-normal cursor-help hover:bg-secondary/80 transition-colors"
        >
          <Icon className="w-3.5 h-3.5 mr-1.5" />
          {title}
          <Info className="w-3 h-3 ml-1.5 opacity-60" />
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="bottom">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">{title}</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

interface InitialHolder {
  address: string;
  shares: string;
}

interface DAICOFormState {
  // DAO basics
  orgName: string;
  orgSymbol: string;
  orgURI: string;
  description: string;
  quorumBps: string; // basis points (e.g., 5000 = 50%)
  ragequittable: boolean;

  // Social media and external links
  twitter: string;
  telegram: string;
  farcaster: string;
  website: string;

  // Sale configuration
  tribTkn: Address; // Payment token (address(0) for ETH)
  tribAmt: string; // How much payment token for forAmt of shares
  saleSupply: string; // Amount of shares/loot to mint for sale
  forAmt: string; // How many shares/loot buyer gets for tribAmt payment
  deadline: string; // Unix timestamp (0 = no deadline)
  sellLoot: boolean; // true = sell loot, false = sell shares

  // Optional modules
  enableAutoLP: boolean;
  lpBps: string; // Portion to LP (0-9999 bps)
  maxSlipBps: string; // Max slippage (default 100 = 1%)
  feeOrHook: string; // Pool fee in bps

  enableInitialMembers: boolean;
  initialHolders: InitialHolder[];

  enablePassiveIncome: boolean;
  opsAddress: string; // Tap beneficiary
  ratePerSec: string; // Tap rate per second
  tapAllowance: string; // Total tap budget

  // Transfer locks
  sharesLocked: boolean;
  lootLocked: boolean;
}

const defaultFormState: DAICOFormState = {
  orgName: "",
  orgSymbol: "",
  orgURI: "",
  description: "",
  quorumBps: "5000", // 50% default
  ragequittable: true,

  twitter: "",
  telegram: "",
  farcaster: "",
  website: "",

  tribTkn: "0x0000000000000000000000000000000000000000" as Address, // ETH
  tribAmt: "0.0001", // Price per token in ETH
  saleSupply: "1000000", // 1M tokens for sale
  forAmt: "1", // 1 token (tribAmt is the price per token)
  deadline: "0",
  sellLoot: false,

  enableAutoLP: false,
  lpBps: "5000", // 50% to LP
  maxSlipBps: "100", // 1% slippage
  feeOrHook: "30", // 0.3% fee (30 bps)

  enableInitialMembers: false,
  initialHolders: [],

  enablePassiveIncome: false,
  opsAddress: "",
  ratePerSec: "0.001", // ETH per second
  tapAllowance: "10", // 10 ETH total budget

  sharesLocked: false,
  lootLocked: false,
};

// Preview Component
function DAICOPreview({ formState, imagePreview }: { formState: DAICOFormState; imagePreview: string | null }) {
  const tokenPrice = useMemo(() => {
    const trib = parseFloat(formState.tribAmt) || 0;
    const forAmt = parseFloat(formState.forAmt) || 1;
    return trib / forAmt;
  }, [formState.tribAmt, formState.forAmt]);

  const totalRaise = useMemo(() => {
    const supply = parseFloat(formState.saleSupply) || 0;
    return supply * tokenPrice;
  }, [formState.saleSupply, tokenPrice]);

  const dailyTapRate = useMemo(() => {
    if (!formState.enablePassiveIncome) return 0;
    const rate = parseFloat(formState.ratePerSec) || 0;
    return rate * 86400; // seconds per day
  }, [formState.enablePassiveIncome, formState.ratePerSec]);

  const enabledModulesCount = [
    formState.enableAutoLP,
    formState.enableInitialMembers,
    formState.enablePassiveIncome,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col space-y-4 h-full min-h-[600px]">
      {/* Preview Label */}
      <div className="px-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Live Preview
        </p>
      </div>

      {/* Header Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 via-purple-500/5 to-background border-primary/20 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center flex-shrink-0 overflow-hidden shadow-lg">
            {imagePreview ? (
              <img src={imagePreview} alt={formState.orgName} className="w-full h-full object-cover" />
            ) : (
              <Coins className="w-8 h-8 text-white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold truncate mb-2">
              {formState.orgName || "Your DAO"}
            </h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                {formState.orgSymbol || "TKN"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {formState.sellLoot ? "Loot Sale" : "Shares Sale"}
              </Badge>
            </div>
          </div>
        </div>
        {formState.description && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {formState.description}
            </p>
          </div>
        )}
      </Card>

      {/* Sale Details */}
      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <DollarSign className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold">Token Sale</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {formState.orgSymbol || "TKN"} Price
            </span>
            <span className="font-semibold">
              {tokenPrice.toFixed(6)} ETH
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Sale Supply</span>
            <span className="font-semibold">
              {parseFloat(formState.saleSupply || "0").toLocaleString()}{" "}
              {formState.orgSymbol || "TKN"}
            </span>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Raise</span>
            <span className="font-bold text-lg text-primary">
              {totalRaise.toFixed(2)} ETH
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Quorum</span>
            <span className="font-semibold">
              {(parseInt(formState.quorumBps) / 100).toFixed(0)}%
            </span>
          </div>

          {formState.ragequittable && (
            <Badge variant="outline" className="w-full justify-center">
              <Shield className="w-3 h-3 mr-1" />
              Ragequit Enabled
            </Badge>
          )}
        </div>
      </Card>

      {/* Active Modules */}
      {enabledModulesCount > 0 && (
        <Card className="p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>
            <h3 className="font-semibold">Active Modules</h3>
            <Badge variant="secondary" className="ml-auto text-xs">
              {enabledModulesCount}
            </Badge>
          </div>

          <div className="space-y-3">
            {formState.enableAutoLP && (
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Droplet className="w-4 h-4 text-blue-500" />
                  <span className="font-medium text-sm">Auto Liquidity Pool</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• {(parseInt(formState.lpBps) / 100).toFixed(1)}% to LP</div>
                  <div>• {(parseInt(formState.feeOrHook) / 100).toFixed(2)}% pool fee</div>
                </div>
              </div>
            )}

            {formState.enableInitialMembers && formState.initialHolders.length > 0 && (
              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-purple-500" />
                  <span className="font-medium text-sm">Initial Members</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formState.initialHolders.length} founding member(s)
                </div>
              </div>
            )}

            {formState.enablePassiveIncome && formState.opsAddress && (
              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-green-500" />
                  <span className="font-medium text-sm">Passive Income</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• {dailyTapRate.toFixed(4)} ETH/day</div>
                  <div>• {parseFloat(formState.tapAllowance)} ETH budget</div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Transfer Locks */}
      {(formState.sharesLocked || formState.lootLocked) && (
        <Card className="p-4 bg-amber-500/10 border-amber-500/20">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-amber-500 mb-1">Transfer Locks Active</div>
              <div className="text-xs text-muted-foreground">
                {formState.sharesLocked && "Shares locked"}
                {formState.sharesLocked && formState.lootLocked && " • "}
                {formState.lootLocked && "Loot locked"}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Info Footer - fills remaining space */}
      <div className="mt-auto pt-6">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your DAICO will be deployed to Ethereum mainnet. Token holders will be able to vote on governance proposals and control fund release through the tap mechanism.
          </p>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <Card
      className={cn(
        "p-6 transition-all duration-300 shadow-sm",
        enabled ? "border-primary/50 bg-primary/5 shadow-md" : "border-border"
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-1">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} className="mt-1" />
      </div>

      {enabled && children && (
        <div className="mt-4 space-y-4 animate-in fade-in duration-300">
          <Separator />
          {children}
        </div>
      )}
    </Card>
  );
}


export default function DAICOWizard() {
  const { address: userAddress, isConnected } = useAccount();
  const [formState, setFormState] = useState<DAICOFormState>(defaultFormState);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [whitepaperFile, setWhitepaperFile] = useState<File | null>(null);

  const { data: ethUsdPrice } = useEthUsdPrice();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const { isLoading: isTxLoading, isSuccess: isTxSuccess } =
    useWaitForTransactionReceipt({
      hash: txHash || undefined,
    });

  const handleImageChange = (file: File | File[] | undefined) => {
    if (file && !Array.isArray(file)) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  };

  const updateField = <K extends keyof DAICOFormState>(
    key: K,
    value: DAICOFormState[K]
  ) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const addInitialHolder = () => {
    setFormState((prev) => ({
      ...prev,
      initialHolders: [...prev.initialHolders, { address: "", shares: "" }],
    }));
  };

  const removeInitialHolder = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      initialHolders: prev.initialHolders.filter((_, i) => i !== index),
    }));
  };

  const updateInitialHolder = (
    index: number,
    field: keyof InitialHolder,
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      initialHolders: prev.initialHolders.map((holder, i) =>
        i === index ? { ...holder, [field]: value } : holder
      ),
    }));
  };

  // Validation function
  const validateForm = (): string | null => {
    if (!formState.orgName.trim()) return "Organization name is required";
    if (!formState.orgSymbol.trim()) return "Symbol is required";
    if (!formState.tribAmt || parseFloat(formState.tribAmt) <= 0)
      return "Price per batch must be greater than 0";
    if (!formState.forAmt || parseFloat(formState.forAmt) <= 0)
      return "Tokens per batch must be greater than 0";
    if (!formState.saleSupply || parseFloat(formState.saleSupply) <= 0)
      return "Sale supply must be greater than 0";

    const quorum = parseInt(formState.quorumBps);
    if (isNaN(quorum) || quorum < 0 || quorum > 10000)
      return "Quorum must be between 0 and 10000 bps";

    if (formState.enableAutoLP) {
      const lpBps = parseInt(formState.lpBps);
      if (isNaN(lpBps) || lpBps < 0 || lpBps >= 10000)
        return "LP portion must be between 0 and 9999 bps";
    }

    if (formState.enableInitialMembers && formState.initialHolders.length > 0) {
      for (const holder of formState.initialHolders) {
        if (!holder.address.match(/^0x[a-fA-F0-9]{40}$/))
          return "Invalid holder address";
        if (!holder.shares || parseFloat(holder.shares) <= 0)
          return "Holder shares must be greater than 0";
      }
    }

    if (formState.enablePassiveIncome) {
      if (!formState.opsAddress.match(/^0x[a-fA-F0-9]{40}$/))
        return "Invalid operator address";
      if (!formState.ratePerSec || parseFloat(formState.ratePerSec) <= 0)
        return "Tap rate must be greater than 0";
      if (!formState.tapAllowance || parseFloat(formState.tapAllowance) <= 0)
        return "Tap budget must be greater than 0";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !userAddress) {
      toast.error("Please connect your wallet");
      return;
    }

    // Validate form
    const validationError = validateForm();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    try {
      setIsUploading(true);

      // Upload image to IPFS (if provided)
      let imageUri: string | undefined;
      if (imageFile) {
        const imageBuffer = await imageFile.arrayBuffer();
        const fileName = `${formState.orgName.replace(/\s+/g, "_")}_logo.${imageFile.name.split(".").pop()}`;
        imageUri = await pinImageToPinata(imageBuffer, fileName, {
          keyvalues: {
            orgName: formState.orgName,
            orgSymbol: formState.orgSymbol,
          },
        });
      }

      // Upload whitepaper to IPFS (if provided)
      let whitepaperUri: string | undefined;
      if (whitepaperFile) {
        const whitepaperBuffer = await whitepaperFile.arrayBuffer();
        const fileName = `${formState.orgName.replace(/\s+/g, "_")}_whitepaper.pdf`;
        whitepaperUri = await pinImageToPinata(whitepaperBuffer, fileName, {
          keyvalues: {
            orgName: formState.orgName,
            orgSymbol: formState.orgSymbol,
            type: "whitepaper",
          },
        });
      }

      // Upload metadata to IPFS
      const metadata: Record<string, unknown> = {
        name: formState.orgName,
        symbol: formState.orgSymbol,
        description: formState.description || `DAICO for ${formState.orgName}`,
        ...(imageUri && { image: imageUri }),
        ...(whitepaperUri && { whitepaper: whitepaperUri }),
      };

      // Add social links if provided
      const socialLinks: Record<string, string> = {};
      if (formState.website) socialLinks.website = formState.website;
      if (formState.twitter) socialLinks.twitter = formState.twitter;
      if (formState.telegram) socialLinks.telegram = formState.telegram;
      if (formState.farcaster) socialLinks.farcaster = formState.farcaster;

      if (Object.keys(socialLinks).length > 0) {
        metadata.links = socialLinks;
      }

      const ipfsHash = await pinJsonToPinata(metadata);
      const uri = `ipfs://${ipfsHash}`;

      setIsUploading(false);

      // Prepare contract arguments
      const summonConfig = DEFAULT_SUMMON_CONFIG;

      // Parse initial holders and shares
      const initHolders =
        formState.enableInitialMembers && formState.initialHolders.length > 0
          ? formState.initialHolders.map((h) => h.address as Address)
          : [];
      const initShares =
        formState.enableInitialMembers && formState.initialHolders.length > 0
          ? formState.initialHolders.map((h) => parseUnits(h.shares, 18))
          : [];

      // Generate salt (random bytes32)
      const salt = `0x${Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join("")}` as `0x${string}`;

      // DAICO config
      const daicoConfig = {
        tribTkn: formState.tribTkn,
        tribAmt: parseEther(formState.tribAmt),
        saleSupply: parseUnits(formState.saleSupply, 18),
        forAmt: parseUnits(formState.forAmt, 18),
        deadline: Number(formState.deadline),
        sellLoot: formState.sellLoot,
        lpBps: formState.enableAutoLP ? parseInt(formState.lpBps) : 0,
        maxSlipBps: formState.enableAutoLP ? parseInt(formState.maxSlipBps) : 100,
        feeOrHook: formState.enableAutoLP ? BigInt(formState.feeOrHook) : 0n,
      };

      // Tap config (only if enabled)
      const tapConfig =
        formState.enablePassiveIncome && formState.opsAddress
          ? {
              ops: formState.opsAddress as Address,
              ratePerSec: parseEther(formState.ratePerSec),
              tapAllowance: parseEther(formState.tapAllowance),
            }
          : {
              ops: "0x0000000000000000000000000000000000000000" as Address,
              ratePerSec: 0n,
              tapAllowance: 0n,
            };

      // Determine which function to call
      const hasPassiveIncome =
        formState.enablePassiveIncome && formState.opsAddress;

      const baseArgs = [
        summonConfig,
        formState.orgName,
        formState.orgSymbol,
        uri,
        parseInt(formState.quorumBps),
        formState.ragequittable,
        "0x0000000000000000000000000000000000000000" as Address, // renderer (optional)
        salt,
        initHolders,
        initShares,
        formState.sharesLocked,
        formState.lootLocked,
        daicoConfig,
      ] as const;

      const hash = hasPassiveIncome
        ? await writeContractAsync({
            address: DaicoAddress,
            abi: DaicoAbi,
            functionName: "summonDAICOWithTap",
            args: [...baseArgs, tapConfig],
          })
        : await writeContractAsync({
            address: DaicoAddress,
            abi: DaicoAbi,
            functionName: "summonDAICO",
            args: baseArgs,
          });

      setTxHash(hash);
      toast.success("DAICO summoning transaction submitted!");
    } catch (error: any) {
      console.error("Error summoning DAICO:", error);
      toast.error(error?.message || "Failed to summon DAICO");
      setIsUploading(false);
    }
  };

  const isLoading = isUploading || isWritePending || isTxLoading;

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 lg:p-8">
      {/* Hero Header */}
      <div className="text-center space-y-6 mb-12 md:mb-16">
        <div className="space-y-4">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Launch Your DAICO
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Community-governed fundraising with built-in transparency and accountability
          </p>
        </div>

        {/* Feature Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <FeaturePill
            icon={Shield}
            title={FEATURE_INFO.governance.title}
            description={FEATURE_INFO.governance.description}
          />
          <FeaturePill
            icon={TrendingUp}
            title={FEATURE_INFO.passiveIncome.title}
            description={FEATURE_INFO.passiveIncome.description}
          />
          <FeaturePill
            icon={Droplet}
            title={FEATURE_INFO.autoLP.title}
            description={FEATURE_INFO.autoLP.description}
          />
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 mt-8">
        {/* Left Column: Preview (Top on mobile) */}
        <div className="lg:sticky lg:top-6 lg:self-start lg:h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pb-6">
          <DAICOPreview formState={formState} imagePreview={imagePreview} />
        </div>

        {/* Right Column: Form (Bottom on mobile) */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic DAO Information */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                DAO Information
              </p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm">

            <div className="space-y-2">
              <Label>Organization Logo</Label>
              <ImageInput onChange={handleImageChange} />
              <p className="text-xs text-muted-foreground">
                Upload an image to represent your DAO
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  placeholder="My DAO"
                  value={formState.orgName}
                  onChange={(e) => updateField("orgName", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="orgSymbol">Symbol</Label>
                <Input
                  id="orgSymbol"
                  placeholder="TKN"
                  value={formState.orgSymbol}
                  onChange={(e) => updateField("orgSymbol", e.target.value.toUpperCase())}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Token symbol (e.g., TKN, DAO, SHARE)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your DAO's mission, goals, and what makes it unique..."
                value={formState.description}
                onChange={(e) => updateField("description", e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Help potential members understand your project
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm font-semibold">Social Links & Resources</Label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website" className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" />
                    Website
                  </Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://example.com"
                    value={formState.website}
                    onChange={(e) => updateField("website", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter" className="flex items-center gap-2">
                    <Twitter className="w-3.5 h-3.5" />
                    Twitter
                  </Label>
                  <Input
                    id="twitter"
                    placeholder="@yourproject or https://twitter.com/yourproject"
                    value={formState.twitter}
                    onChange={(e) => updateField("twitter", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telegram" className="flex items-center gap-2">
                    <MessageCircle className="w-3.5 h-3.5" />
                    Telegram
                  </Label>
                  <Input
                    id="telegram"
                    placeholder="https://t.me/yourgroup"
                    value={formState.telegram}
                    onChange={(e) => updateField("telegram", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="farcaster" className="flex items-center gap-2">
                    <Hash className="w-3.5 h-3.5" />
                    Farcaster
                  </Label>
                  <Input
                    id="farcaster"
                    placeholder="@username or https://warpcast.com/username"
                    value={formState.farcaster}
                    onChange={(e) => updateField("farcaster", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whitepaper" className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Whitepaper (Optional)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="whitepaper"
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setWhitepaperFile(file || null);
                    }}
                    className="cursor-pointer"
                  />
                  {whitepaperFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setWhitepaperFile(null);
                        const input = document.getElementById("whitepaper") as HTMLInputElement;
                        if (input) input.value = "";
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {whitepaperFile && (
                  <p className="text-xs text-muted-foreground">
                    {whitepaperFile.name} ({(whitepaperFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload a PDF document with your project details (will be pinned to IPFS)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor="quorumBps">Voting Quorum</Label>
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-80" side="right">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Voting Quorum</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          The minimum percentage of voting shares that must participate for a proposal to pass. Higher quorum (60-80%) provides more security and ensures broader consensus, while lower quorum (20-40%) enables faster decision-making. 50% is a common balanced choice.
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-primary">
                    {(parseInt(formState.quorumBps) / 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <Slider
                id="quorumBps"
                min={0}
                max={100}
                step={1}
                value={[parseInt(formState.quorumBps) / 100]}
                onValueChange={(values) => updateField("quorumBps", (values[0] * 100).toString())}
                className="py-4"
              />
              <p className="text-xs text-muted-foreground">
                Percentage of shares needed to approve proposals
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="ragequittable"
                checked={formState.ragequittable}
                onCheckedChange={(checked) => updateField("ragequittable", checked)}
              />
              <Label htmlFor="ragequittable" className="cursor-pointer flex items-center gap-2">
                Allow ragequit
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80" side="right">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Ragequit</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Allows members to exit the DAO at any time by burning their tokens in exchange for their proportional share of the treasury. This provides an exit mechanism and protects minority token holders from malicious proposals.
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </Label>
            </div>
            </Card>
          </div>

          {/* Sale Configuration */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Token Sale Configuration
              </p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm">

            <div className="space-y-2">
              <Label htmlFor="tokenPrice">Price per token (ETH)</Label>
              <Input
                id="tokenPrice"
                type="text"
                inputMode="decimal"
                placeholder="0.0001"
                value={formState.tribAmt}
                onChange={(e) => {
                  const val = e.target.value;
                  // Allow empty, numbers, and decimals
                  if (val === "" || /^\d*\.?\d*$/.test(val)) {
                    updateField("forAmt", "1");
                    updateField("tribAmt", val);
                  }
                }}
                required
              />
              <p className="text-xs text-muted-foreground">
                How much ETH each token costs
              </p>
            </div>

            {/* Price in USD */}
            {formState.tribAmt && parseFloat(formState.tribAmt) > 0 && ethUsdPrice ? (
              <p className="text-xs text-muted-foreground -mt-1">
                ≈ ${(parseFloat(formState.tribAmt) * ethUsdPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} per token
              </p>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="saleSupply">Total sale supply</Label>
              <Input
                id="saleSupply"
                type="number"
                placeholder="1000000"
                value={formState.saleSupply}
                onChange={(e) => updateField("saleSupply", e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Total tokens allocated for the sale
              </p>
            </div>

            {/* Total raise summary */}
            {formState.tribAmt && formState.saleSupply &&
             parseFloat(formState.tribAmt) > 0 && parseFloat(formState.saleSupply) > 0 && (() => {
              const pricePerToken = parseFloat(formState.tribAmt);
              const totalRaiseEth = parseFloat(formState.saleSupply) * pricePerToken;
              const totalRaiseUsd = ethUsdPrice ? totalRaiseEth * ethUsdPrice : 0;

              return (
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-sm text-center">
                    <span className="text-muted-foreground">If sold out, you'll raise </span>
                    <span className="font-bold text-primary">
                      {totalRaiseEth.toLocaleString(undefined, { maximumFractionDigits: 4 })} ETH
                    </span>
                    {ethUsdPrice ? (
                      <span className="text-muted-foreground">
                        {" "}(${totalRaiseUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })()}

            <div className="flex items-center space-x-2">
              <Switch
                id="sellLoot"
                checked={formState.sellLoot}
                onCheckedChange={(checked) => updateField("sellLoot", checked)}
              />
              <Label htmlFor="sellLoot" className="cursor-pointer flex items-center gap-2">
                Sell Loot tokens (non-voting shares) instead of Shares
                <HoverCard openDelay={200}>
                  <HoverCardTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                  </HoverCardTrigger>
                  <HoverCardContent className="w-80" side="right">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">Loot vs Shares</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        <strong>Shares</strong> provide voting rights and treasury claims. <strong>Loot</strong> only provides treasury claims without voting power. Use Loot for passive investors who want treasury exposure without governance participation.
                      </p>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              </Label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="sharesLocked"
                  checked={formState.sharesLocked}
                  onCheckedChange={(checked) =>
                    updateField("sharesLocked", checked)
                  }
                />
                <Label htmlFor="sharesLocked" className="cursor-pointer text-sm flex items-center gap-2">
                  Lock Shares (non-transferable)
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72" side="top">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Lock Shares</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          When locked, shares cannot be transferred between addresses. This prevents token trading and ensures voting power stays with committed members.
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="lootLocked"
                  checked={formState.lootLocked}
                  onCheckedChange={(checked) => updateField("lootLocked", checked)}
                />
                <Label htmlFor="lootLocked" className="cursor-pointer text-sm flex items-center gap-2">
                  Lock Loot (non-transferable)
                  <HoverCard openDelay={200}>
                    <HoverCardTrigger asChild>
                      <Info className="w-3 h-3 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72" side="top">
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm">Lock Loot</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          When locked, loot tokens cannot be transferred between addresses. This ensures treasury claims stay with original contributors.
                        </p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                </Label>
              </div>
            </div>
            </Card>
          </div>

          {/* Optional Modules */}
          <div className="space-y-4">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Optional Features
              </p>
              <p className="text-sm text-muted-foreground">
                Add advanced functionality to your DAICO
              </p>
            </div>

            {/* Auto LP Module */}
            <ModuleCard
              title="Enable auto LP from raise"
              description="Automatically create a liquidity pool with a portion of raised funds"
              enabled={formState.enableAutoLP}
              onToggle={(enabled) => updateField("enableAutoLP", enabled)}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lpBps">LP portion (bps)</Label>
                  <Input
                    id="lpBps"
                    type="number"
                    placeholder="5000"
                    value={formState.lpBps}
                    onChange={(e) => updateField("lpBps", e.target.value)}
                    min="0"
                    max="9999"
                  />
                  <p className="text-xs text-muted-foreground">
                    {(parseInt(formState.lpBps) / 100).toFixed(1)}% to liquidity
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxSlipBps">Max slippage (bps)</Label>
                  <Input
                    id="maxSlipBps"
                    type="number"
                    placeholder="100"
                    value={formState.maxSlipBps}
                    onChange={(e) => updateField("maxSlipBps", e.target.value)}
                    min="0"
                    max="10000"
                  />
                  <p className="text-xs text-muted-foreground">
                    {(parseInt(formState.maxSlipBps) / 100).toFixed(1)}% max slippage
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="feeOrHook">Pool fee (bps)</Label>
                  <Input
                    id="feeOrHook"
                    type="number"
                    placeholder="30"
                    value={formState.feeOrHook}
                    onChange={(e) => updateField("feeOrHook", e.target.value)}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {(parseInt(formState.feeOrHook) / 100).toFixed(2)}% fee
                  </p>
                </div>
              </div>
            </ModuleCard>

            {/* Initial Members Module */}
            <ModuleCard
              title="Add initial members"
              description="Allocate initial shares to founding members"
              enabled={formState.enableInitialMembers}
              onToggle={(enabled) => updateField("enableInitialMembers", enabled)}
            >
              <div className="space-y-3">
                {formState.initialHolders.map((holder, index) => (
                  <div key={index} className="flex gap-3">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs">Address</Label>
                      <Input
                        placeholder="0x..."
                        value={holder.address}
                        onChange={(e) =>
                          updateInitialHolder(index, "address", e.target.value)
                        }
                      />
                    </div>
                    <div className="w-32 space-y-2">
                      <Label className="text-xs">Shares</Label>
                      <Input
                        type="number"
                        placeholder="1000"
                        value={holder.shares}
                        onChange={(e) =>
                          updateInitialHolder(index, "shares", e.target.value)
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-6"
                      onClick={() => removeInitialHolder(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addInitialHolder}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Member
                </Button>
              </div>
            </ModuleCard>

            {/* Passive Income Module */}
            <ModuleCard
              title="Add passive income for operator"
              description="Set up a tap mechanism for periodic fund release to operations team"
              enabled={formState.enablePassiveIncome}
              onToggle={(enabled) => updateField("enablePassiveIncome", enabled)}
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="opsAddress">Operator address</Label>
                  <Input
                    id="opsAddress"
                    placeholder="0x..."
                    value={formState.opsAddress}
                    onChange={(e) => updateField("opsAddress", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Address that can claim the periodic payments
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="ratePerSec">Rate per second (ETH)</Label>
                    <Input
                      id="ratePerSec"
                      type="number"
                      step="0.000001"
                      placeholder="0.001"
                      value={formState.ratePerSec}
                      onChange={(e) => updateField("ratePerSec", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      ≈ {(parseFloat(formState.ratePerSec) * 86400).toFixed(4)}{" "}
                      ETH/day
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tapAllowance">Total budget (ETH)</Label>
                    <Input
                      id="tapAllowance"
                      type="number"
                      step="0.1"
                      placeholder="10"
                      value={formState.tapAllowance}
                      onChange={(e) => updateField("tapAllowance", e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum funds operator can claim
                    </p>
                  </div>
                </div>
              </div>
            </ModuleCard>
          </div>

          {/* Submit Button */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Deploy
              </p>
            </div>
            <Card className="p-6 shadow-sm">
            {!isConnected ? (
              <Button type="button" size="lg" className="w-full" disabled>
                Connect Wallet to Continue
              </Button>
            ) : isTxSuccess ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-green-500">
                  <CheckCircle className="w-6 h-6" />
                  <span className="text-lg font-semibold">
                    DAICO Summoned Successfully!
                  </span>
                </div>
                {txHash && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(getEtherscanTxUrl(txHash), "_blank")}
                  >
                    View on Etherscan
                  </Button>
                )}
              </div>
            ) : (
              <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {isUploading
                      ? "Uploading metadata..."
                      : isTxLoading
                        ? "Confirming..."
                        : "Summoning..."}
                  </>
                ) : (
                  "Summon DAICO"
                )}
              </Button>
            )}
            </Card>
          </div>
        </form>
      </div>
    </div>
  );
}
