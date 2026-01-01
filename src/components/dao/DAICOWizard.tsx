import { useState, useEffect } from "react";
import type React from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { DaicoAbi, DaicoAddress } from "@/constants/DAICO";
import { parseUnits, parseEther, Address, decodeEventLog } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  Loader2,
  Coins,
  Shield,
  Calendar,
  DollarSign,
  Info,
  ExternalLink,
  TrendingUp,
  Upload,
  X,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { getEtherscanTxUrl } from "@/lib/explorer";
import { pinJsonToPinata, pinImageToPinata } from "@/lib/pinata";
import { Badge } from "@/components/ui/badge";
import { ImageInput } from "@/components/ui/image-input";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useNavigate } from "@tanstack/react-router";

// Default addresses from user
const DEFAULT_SUMMON_CONFIG = {
  summoner: "0x0000000000330B8df9E3bc5E553074DA58eE9138" as Address,
  molochImpl: "0x643A45B599D81be3f3A68F37EB3De55fF10673C1" as Address,
  sharesImpl: "0x71E9b38d301b5A58cb998C1295045FE276Acf600" as Address,
  lootImpl: "0x6f1f2aF76a3aDD953277e9F369242697C87bc6A5" as Address,
};

// BUTERIN Template - Fixed configuration
// "Raise 10 ETH selling 1,000,000,000 Shares. 10% quorum. 30-day sale. Tap 100% over 90 days"
const BUTERIN_TEMPLATE = {
  saleSupply: "1000000000", // 1 billion tokens
  tribAmt: "0.00000001", // 0.01 ETH per 1M tokens
  forAmt: "1", // 1 token per price unit
  totalRaise: "10", // 10 ETH total
  quorumBps: "1000", // 10% quorum
  ragequittable: true, // Ragequit enabled
  sellLoot: false, // Selling shares (voting tokens)
  ratePerSec: "0.000001286", // ≈ 0.1111 ETH/day (100% over 90 days)
  tapAllowance: "10", // 10 ETH budget (100% of raise)
  saleDurationDays: 30, // 30-day max sale duration
  tapDurationDays: 90, // 90-day tap release period
  // Passive income always enabled
  enablePassiveIncome: true,
  // Auto LP and initial members disabled
  enableAutoLP: false,
  enableInitialMembers: false,
  sharesLocked: false,
  lootLocked: false,
} as const;

// Feature info for hover cards
const FEATURE_INFO = {
  governance: {
    title: "Token Governance",
    description:
      "Token holders can vote on proposals to control the DAO. Each token represents voting power (10% quorum), allowing the community to make decisions about fund allocation and governance matters.",
  },
  passiveIncome: {
    title: "Automated Tap",
    description:
      "The tap mechanism automatically releases funds to an operator address over 90 days. Token holders can vote to adjust or freeze the tap rate, ensuring accountability and controlled spending.",
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
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

// Simplified interface - only editable metadata fields
interface DAICOFormState {
  // Core identity
  orgName: string;
  orgSymbol: string;

  // Pointed questions for transparency
  whatDescription: string; // What is this DAO/project?
  whyDescription: string; // Why should people participate?
  howDescription: string; // How will funds be used?

  // Organization socials
  website: string; // Optional
  twitter: string; // Optional (handle without @)

  // Operator information
  opsAddress: string; // Where tap payments go (required)
  opsName: string; // Operator name (can be pseudonym)
  opsTwitter: string; // Optional (handle without @)
}

const defaultFormState: DAICOFormState = {
  orgName: "",
  orgSymbol: "",
  whatDescription: "",
  whyDescription: "",
  howDescription: "",
  website: "",
  twitter: "",
  opsAddress: "",
  opsName: "",
  opsTwitter: "",
};

// Preview Component
function DAICOPreview({ formState, imagePreview }: { formState: DAICOFormState; imagePreview: string | null }) {
  // All values come from BUTERIN_TEMPLATE (fixed)
  const tokenPrice = parseFloat(BUTERIN_TEMPLATE.tribAmt);
  const totalRaise = parseFloat(BUTERIN_TEMPLATE.totalRaise);
  const dailyTapRate = parseFloat(BUTERIN_TEMPLATE.ratePerSec) * 86400; // seconds per day

  return (
    <div className="flex flex-col space-y-4 h-full min-h-[600px]">
      {/* Preview Label */}
      <div className="px-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Preview</p>
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
            <h2 className="text-2xl font-bold truncate mb-2">{formState.orgName || "Your DAO"}</h2>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-xs">
                {formState.orgSymbol || "TKN"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Shares Sale
              </Badge>
              <Badge variant="secondary" className="text-xs bg-primary/10 text-primary">
                BUTERIN Template
              </Badge>
            </div>
          </div>
        </div>
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
            <span className="text-sm text-muted-foreground">{formState.orgSymbol || "TKN"} Price</span>
            <span className="font-semibold">{tokenPrice.toFixed(8)} ETH</span>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">0.01 ETH per 1M tokens</p>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Sale Supply</span>
            <span className="font-semibold">
              {parseFloat(BUTERIN_TEMPLATE.saleSupply).toLocaleString()} {formState.orgSymbol || "TKN"}
            </span>
          </div>

          <Separator />

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Raise</span>
            <span className="font-bold text-lg text-primary">{totalRaise} ETH</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Quorum</span>
            <span className="font-semibold">{parseInt(BUTERIN_TEMPLATE.quorumBps) / 100}%</span>
          </div>

          <Badge variant="outline" className="w-full justify-center">
            <Shield className="w-3 h-3 mr-1" />
            Ragequit Enabled
          </Badge>
        </div>
      </Card>

      {/* Tap Configuration (Always enabled in BUTERIN template) */}
      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <h3 className="font-semibold">Tap Configuration</h3>
        </div>

        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 space-y-2">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-green-500" />
            <span className="font-medium text-sm">Automated Fund Release</span>
          </div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• Release rate: ≈ {dailyTapRate.toFixed(4)} ETH/day</div>
            <div>• Total budget: {parseFloat(BUTERIN_TEMPLATE.tapAllowance)} ETH (100% of raise)</div>
            <div>• Duration: {BUTERIN_TEMPLATE.tapDurationDays} days</div>
            <div>• All holders vote. Tap releases funds automatically to ops.</div>
          </div>
          {formState.opsAddress && (
            <div className="mt-2 pt-2 border-t border-green-500/20">
              <div className="text-xs text-muted-foreground">Operator address:</div>
              <div className="font-mono text-xs break-all text-foreground">{formState.opsAddress}</div>
            </div>
          )}
        </div>
      </Card>

      {/* Info Footer - fills remaining space */}
      <div className="mt-auto pt-6">
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong>BUTERIN Template:</strong> Your DAICO will be deployed to Ethereum mainnet with 10% quorum, ragequit
            enabled, 30-day sale deadline, and automated tap releasing 100% of raise over 90 days. Token holders vote on governance proposals
            and control the fund release.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function DAICOWizard() {
  const { address: userAddress, isConnected } = useAccount();
  const [formState, setFormState] = useState<DAICOFormState>(defaultFormState);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [summonedDaoAddress, setSummonedDaoAddress] = useState<Address | null>(null);
  const navigate = useNavigate();

  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const {
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
    data: txReceipt,
  } = useWaitForTransactionReceipt({
    hash: txHash || undefined,
  });

  // Extract DAO address from transaction receipt
  useEffect(() => {
    if (txReceipt && isTxSuccess) {
      // Look for SaleSet event which includes the DAO address
      const saleSetEvent = txReceipt.logs.find((log) => {
        try {
          const decoded = decodeEventLog({
            abi: DaicoAbi,
            data: log.data,
            topics: log.topics,
          });
          return decoded.eventName === "SaleSet";
        } catch {
          return false;
        }
      });

      if (saleSetEvent) {
        const decoded = decodeEventLog({
          abi: DaicoAbi,
          data: saleSetEvent.data,
          topics: saleSetEvent.topics,
        });
        const daoAddress = (decoded.args as any)?.dao as Address;
        if (daoAddress) {
          setSummonedDaoAddress(daoAddress);
        }
      }
    }
  }, [txReceipt, isTxSuccess]);

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

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      // Validate file sizes (max 10MB per file)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const validFiles = fileArray.filter((file) => {
        if (file.size > maxSize) {
          toast.error(`${file.name} exceeds 10MB limit`);
          return false;
        }
        return true;
      });

      setAttachmentFiles((prev) => [...prev, ...validFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateField = <K extends keyof DAICOFormState>(key: K, value: DAICOFormState[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  // Simplified validation for BUTERIN template
  const validateForm = (): string | null => {
    if (!formState.orgName.trim()) return "Organization name is required";
    if (!formState.orgSymbol.trim()) return "Symbol is required";
    if (!formState.whatDescription.trim()) return "Please describe what this DAO/project is about";
    if (!formState.whyDescription.trim()) return "Please explain why people should participate";
    if (!formState.howDescription.trim()) return "Please explain how funds will be used";
    if (!formState.opsAddress.match(/^0x[a-fA-F0-9]{40}$/))
      return "Valid operator address is required for tap payments";
    if (!formState.opsName.trim()) return "Operator name is required";
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

      // Upload attachment files to IPFS (if provided)
      const attachmentUris: Array<{ name: string; uri: string; size: number }> = [];
      if (attachmentFiles.length > 0) {
        for (const file of attachmentFiles) {
          const fileBuffer = await file.arrayBuffer();
          const uri = await pinImageToPinata(fileBuffer, file.name, {
            keyvalues: {
              orgName: formState.orgName,
              type: "attachment",
            },
          });
          attachmentUris.push({
            name: file.name,
            uri,
            size: file.size,
          });
        }
      }

      // Upload metadata to IPFS
      const metadata = {
        name: formState.orgName,
        symbol: formState.orgSymbol,
        description: formState.whatDescription,
        // Extended metadata for transparency
        what: formState.whatDescription,
        why: formState.whyDescription,
        how: formState.howDescription,
        // Socials
        ...(formState.website && { website: formState.website }),
        ...(formState.twitter && { twitter: formState.twitter.replace(/^@/, "") }),
        // Operator info
        operator: {
          address: formState.opsAddress,
          name: formState.opsName,
          ...(formState.opsTwitter && { twitter: formState.opsTwitter.replace(/^@/, "") }),
        },
        // Supporting documents
        ...(attachmentUris.length > 0 && { attachments: attachmentUris }),
        // Template info
        template: "BUTERIN",
        ...(imageUri && { image: imageUri }),
      };

      const ipfsHash = await pinJsonToPinata(metadata);
      const uri = ipfsHash;

      setIsUploading(false);

      // Prepare contract arguments using BUTERIN_TEMPLATE
      const summonConfig = DEFAULT_SUMMON_CONFIG;

      // No initial holders in BUTERIN template
      const initHolders: Address[] = [];
      const initShares: bigint[] = [];

      // Generate salt (random bytes32)
      const salt = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(
        "",
      )}` as `0x${string}`;

      // DAICO config using BUTERIN_TEMPLATE
      // Calculate deadline: 30 days from now
      const deadline = Math.floor(Date.now() / 1000) + (BUTERIN_TEMPLATE.saleDurationDays * 24 * 60 * 60);

      const daicoConfig = {
        tribTkn: "0x0000000000000000000000000000000000000000" as Address, // ETH
        tribAmt: parseEther(BUTERIN_TEMPLATE.tribAmt),
        saleSupply: parseUnits(BUTERIN_TEMPLATE.saleSupply, 18),
        forAmt: parseUnits(BUTERIN_TEMPLATE.forAmt, 18),
        deadline: deadline, // 30-day deadline
        sellLoot: BUTERIN_TEMPLATE.sellLoot,
        lpBps: 0, // No auto LP in BUTERIN
        maxSlipBps: 100,
        feeOrHook: 0n,
      };

      // Tap config (always enabled in BUTERIN template)
      const tapConfig = {
        ops: formState.opsAddress as Address,
        ratePerSec: parseEther(BUTERIN_TEMPLATE.ratePerSec),
        tapAllowance: parseEther(BUTERIN_TEMPLATE.tapAllowance),
      };

      const baseArgs = [
        summonConfig,
        formState.orgName,
        formState.orgSymbol,
        uri,
        parseInt(BUTERIN_TEMPLATE.quorumBps),
        BUTERIN_TEMPLATE.ragequittable,
        "0x0000000000000000000000000000000000000000" as Address, // renderer (optional)
        salt,
        initHolders,
        initShares,
        BUTERIN_TEMPLATE.sharesLocked,
        BUTERIN_TEMPLATE.lootLocked,
        daicoConfig,
      ] as const;

      // Always use summonDAICOWithTap for BUTERIN template
      const hash = await writeContractAsync({
        address: DaicoAddress,
        abi: DaicoAbi,
        functionName: "summonDAICOWithTap",
        args: [...baseArgs, tapConfig],
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
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">Launch Your DAICO</h1>
          <Badge variant="secondary" className="text-lg px-6 py-2 bg-primary/10 text-primary">
            BUTERIN Template
          </Badge>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            Raise 10 ETH selling 1 billion shares with 10% quorum, 30-day sale, automated tap releasing funds over 90 days
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
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 mt-8">
        {/* Left Column: Preview (Top on mobile) */}
        <div className="lg:sticky lg:top-6 lg:self-start lg:h-[calc(100vh-8rem)] lg:overflow-y-auto lg:pb-6">
          <DAICOPreview formState={formState} imagePreview={imagePreview} />
        </div>

        {/* Right Column: Simplified Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Identity */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Basic Identity</p>
              <p className="text-sm text-muted-foreground mt-1">How will people know your DAO?</p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm">
              <div className="space-y-2">
                <Label>Organization Logo *</Label>
                <ImageInput onChange={handleImageChange} />
                <p className="text-xs text-muted-foreground">Upload an image to represent your DAO</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name *</Label>
                  <Input
                    id="orgName"
                    placeholder="My DAO"
                    value={formState.orgName}
                    onChange={(e) => updateField("orgName", e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgSymbol">Token Symbol *</Label>
                  <Input
                    id="orgSymbol"
                    placeholder="DAO"
                    value={formState.orgSymbol}
                    onChange={(e) => updateField("orgSymbol", e.target.value.toUpperCase())}
                    required
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">Max 10 characters (e.g., DAO, CLUB, BUILD)</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://..."
                    value={formState.website}
                    onChange={(e) => updateField("website", e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Optional - Your project website</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="twitter">Twitter/X Handle</Label>
                  <Input
                    id="twitter"
                    placeholder="username (without @)"
                    value={formState.twitter}
                    onChange={(e) => updateField("twitter", e.target.value.replace(/^@/, ""))}
                  />
                  <p className="text-xs text-muted-foreground">Optional - Without the @ symbol</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Transparency Questions */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Transparency & Trust</p>
              <p className="text-sm text-muted-foreground mt-1">Help participants understand your project</p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm">
              <div className="space-y-2">
                <Label htmlFor="whatDescription">What is this DAO/project about? *</Label>
                <Textarea
                  id="whatDescription"
                  placeholder="Describe what you're building, the problem you're solving, or the community you're creating..."
                  value={formState.whatDescription}
                  onChange={(e) => updateField("whatDescription", e.target.value)}
                  rows={3}
                  className="resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">Be clear and specific about your project's purpose</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whyDescription">Why should people participate? *</Label>
                <Textarea
                  id="whyDescription"
                  placeholder="Explain the value proposition, benefits for token holders, or the vision participants will be supporting..."
                  value={formState.whyDescription}
                  onChange={(e) => updateField("whyDescription", e.target.value)}
                  rows={3}
                  className="resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">What's in it for participants? Why join this DAO?</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="howDescription">How will the raised funds be used? *</Label>
                <Textarea
                  id="howDescription"
                  placeholder="Break down planned spending: development, marketing, operations, team, etc..."
                  value={formState.howDescription}
                  onChange={(e) => updateField("howDescription", e.target.value)}
                  rows={3}
                  className="resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">Be specific about how the 10 ETH raise will be allocated</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="attachments">Supporting Documents (Optional)</Label>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      id="attachments"
                      type="file"
                      multiple
                      onChange={handleAttachmentChange}
                      className="cursor-pointer"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                    <Button type="button" size="sm" variant="outline" className="whitespace-nowrap">
                      <Upload className="w-4 h-4 mr-2" />
                      Add Files
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Upload roadmaps, budgets, whitepapers, etc. Max 10MB per file
                  </p>

                  {attachmentFiles.length > 0 && (
                    <div className="space-y-2">
                      {attachmentFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              ({(file.size / 1024 / 1024).toFixed(2)} MB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 flex-shrink-0"
                            onClick={() => removeAttachment(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Operator Information */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Operator Information</p>
              <p className="text-sm text-muted-foreground mt-1">Who will manage operations and receive tap payments?</p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm">
              <div className="space-y-2">
                <Label htmlFor="opsName">Operator Name *</Label>
                <Input
                  id="opsName"
                  placeholder="Your name or pseudonym"
                  value={formState.opsName}
                  onChange={(e) => updateField("opsName", e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">Can be a pseudonym - but accountability matters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="opsTwitter">Operator Twitter/X Handle</Label>
                <Input
                  id="opsTwitter"
                  placeholder="username (without @)"
                  value={formState.opsTwitter}
                  onChange={(e) => updateField("opsTwitter", e.target.value.replace(/^@/, ""))}
                />
                <p className="text-xs text-muted-foreground">Optional - Social verification helps build trust</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="opsAddress">Operator Wallet Address *</Label>
                <Input
                  id="opsAddress"
                  placeholder="0x..."
                  value={formState.opsAddress}
                  onChange={(e) => updateField("opsAddress", e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Receives automated tap payments (≈ 0.1111 ETH/day for 90 days)
                </p>
              </div>
            </Card>
          </div>

          {/* BUTERIN Template Configuration (View-Only) */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                BUTERIN Template Configuration
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Fixed settings optimized for governance + automated funding
              </p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm bg-muted/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label>Voting Quorum</Label>
                    <HoverCard openDelay={200}>
                      <HoverCardTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80" side="right">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Voting Quorum</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            The minimum percentage of voting shares that must participate for a proposal to pass.
                            BUTERIN template uses 10% for faster decision-making while maintaining community oversight.
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <span className="text-2xl font-bold text-primary">10%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  ✓ Fixed at 10% - All holders vote on governance proposals
                </p>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label>Ragequit</Label>
                    <HoverCard openDelay={200}>
                      <HoverCardTrigger asChild>
                        <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help hover:text-foreground transition-colors" />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80" side="right">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-sm">Ragequit</h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            Allows members to exit the DAO at any time by burning their tokens in exchange for their
                            proportional share of the treasury. This protects minority token holders.
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Enabled
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">✓ Members can exit anytime with their share of treasury</p>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label>Token Type</Label>
                  <Badge variant="secondary">Voting Shares</Badge>
                </div>
                <p className="text-xs text-muted-foreground">✓ Shares with voting rights (not non-voting loot)</p>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label>Transfer Locks</Label>
                  <Badge variant="outline">None</Badge>
                </div>
                <p className="text-xs text-muted-foreground">✓ Tokens are transferable - no locks</p>
              </div>
            </Card>
          </div>

          {/* Sale Configuration (View-Only) */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Token Sale Details</p>
              <p className="text-sm text-muted-foreground mt-1">Pre-configured sale parameters</p>
            </div>
            <Card className="p-6 space-y-4 shadow-sm bg-muted/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Price per Token</Label>
                  <span className="font-mono font-bold">{parseFloat(BUTERIN_TEMPLATE.tribAmt).toFixed(8)} ETH</span>
                </div>
                <p className="text-xs text-muted-foreground">✓ Fixed at 0.01 ETH per 1M tokens</p>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label>Sale Supply</Label>
                  <span className="font-mono font-bold">
                    {parseFloat(BUTERIN_TEMPLATE.saleSupply).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">✓ 1 billion voting shares for sale</p>

                <Separator />

                <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Total Raise (if sold out)</span>
                    <span className="text-2xl font-bold text-primary">{BUTERIN_TEMPLATE.totalRaise} ETH</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Selling {parseFloat(BUTERIN_TEMPLATE.saleSupply).toLocaleString()} tokens at{" "}
                    {parseFloat(BUTERIN_TEMPLATE.tribAmt).toFixed(8)} ETH each
                  </p>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label>Sale Deadline</Label>
                  <Badge variant="outline">{BUTERIN_TEMPLATE.saleDurationDays} Days</Badge>
                </div>
                <p className="text-xs text-muted-foreground">✓ Sale closes after {BUTERIN_TEMPLATE.saleDurationDays} days or when sold out</p>
              </div>
            </Card>
          </div>

          {/* Submit Button */}
          <div className="space-y-3">
            <div className="px-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Deploy</p>
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
                    <span className="text-lg font-semibold">DAICO Summoned Successfully!</span>
                  </div>

                  {summonedDaoAddress && (
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <div className="text-sm text-muted-foreground mb-2">DAO Address</div>
                      <div className="font-mono text-sm break-all">{summonedDaoAddress}</div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {txHash && (
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1"
                        onClick={() => window.open(getEtherscanTxUrl(txHash), "_blank")}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View on Etherscan
                      </Button>
                    )}

                    {summonedDaoAddress && (
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={() => {
                          navigate({
                            to: "/orgs/$chainId/$daoAddress",
                            params: {
                              chainId: "1", // Ethereum mainnet
                              daoAddress: summonedDaoAddress,
                            },
                          });
                        }}
                      >
                        View Organization
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <Button type="submit" size="lg" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      {isUploading ? "Uploading metadata..." : isTxLoading ? "Confirming..." : "Summoning..."}
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
