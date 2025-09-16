import { amountInWords } from "@/lib/math";
import { SimpleForm } from ".";
import { Avatar, AvatarImage } from "../ui/avatar";
import { Heading } from "../ui/typography";
import { TokenMetadata } from "@/lib/pools"; // ⬅️ NEW

interface LivePreviewProps {
  coinId?: string;
  form: SimpleForm;
  imagePreviewUrl: string;

  // ⬇️ NEW props for pool/live details
  addPoolOpen?: boolean;
  poolPct?: number;
  poolSupplyTokens?: number;
  creatorSupplyTokens?: number;
  tokenIn?: TokenMetadata;
  amountInText?: string;
  feeOrHook?: bigint;
  isHook?: boolean;
}

const shortAddr = (addr?: string) => (addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "");

export const LivePreview = ({
  coinId,
  form,
  imagePreviewUrl,
  addPoolOpen,
  poolPct = 0,
  poolSupplyTokens = 0,
  creatorSupplyTokens = 0,
  tokenIn,
  amountInText,
  feeOrHook,
  isHook,
}: LivePreviewProps) => {
  const poolPctClamped = Math.max(0, Math.min(100, Math.floor(poolPct)));
  const creatorPct = 100 - poolPctClamped;

  const feeBps = !isHook && typeof feeOrHook !== "undefined" ? Number(feeOrHook.toString()) : undefined;

  return (
    <div className={`lg:sticky lg:top-4 lg:self-start max-h-fit overflow-y-auto pb-6 bg-muted mb-2 p-2`}>
      <div>
        <Heading level={2}>Preview</Heading>
        <p className="mt-1 text-muted-foreground">Live preview of your coin.</p>
      </div>

      <div>
        <div className="flex flex-col items-center justify-center">
          {/* Image */}
          <div className="w-full flex items-center justify-center">
            <div>
              <Avatar className="rounded-md mt-4 h-12 w-12 lg:h-48 lg:w-48">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <AvatarImage
                  src={imagePreviewUrl || "/zammzamm.png"}
                  alt={form.name || "Coin image"}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "https://placehold.co/800x800/png?text=Image+not+found";
                  }}
                />
              </Avatar>
              <p className="mt-2 text-xs text-center text-muted-foreground break-all">
                {imagePreviewUrl ? "local preview" : "upload an image"}
              </p>
            </div>
          </div>

          {/* Meta & Stats */}
          <div className="w-full flex flex-col items-start justify-start px-4 mt-8">
            <div className="flex flex-row gap-2">
              {coinId && <p className="border-border border p-1 text-4xl">{coinId}</p>}
              <div className="flex flex-row items-center gap-4">
                <Heading level={4} className="text-4xl font-bold tracking-tight">
                  {form.name || "Your Coin Name"}
                </Heading>
                <span className="text-md text-muted-foreground">[{form.symbol ? `${form.symbol}` : "SYMBOL"}]</span>
              </div>
            </div>

            <p className="mt-1 ml-2 text-md text-muted-foreground whitespace-pre-wrap">
              {form.description || "yap about ye coin here"}
            </p>

            {/* Mechanics */}
            <div className="w-full mt-4">
              <Heading level={4} className="font-bold">
                Mechanics
              </Heading>

              {/* Total Supply */}
              <div className="mt-2 bg-accent text-accent-foreground p-2 border border-border w-full">
                <div className="grid grid-cols-[max-content,1fr] gap-x-4 items-start w-full">
                  <p className="whitespace-nowrap">Total Supply</p>

                  {/* value column */}
                  <div className="min-w-0 max-w-full">
                    <p className="truncate">
                      {form.supply?.toLocaleString() || "0"} {form.symbol || "SYMBOL"}
                    </p>
                    <p className="text-xs text-muted-foreground whitespace-normal break-words md:break-words break-all leading-snug">
                      {amountInWords(form?.supply || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Pool Setup (live) */}
              {addPoolOpen && (
                <div className="mt-3 bg-accent text-accent-foreground p-2 border border-border w-full">
                  <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-2 items-start w-full">
                    <p>Split</p>
                    <p>
                      {poolPctClamped}% to pool • {creatorPct}% to creator
                    </p>

                    <p>Pool Allocation</p>
                    <div className="min-w-0 max-w-full">
                      <p className="truncate">
                        {poolSupplyTokens.toLocaleString()} {form.symbol || "SYMBOL"}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{amountInWords(poolSupplyTokens)}</p>
                    </div>

                    <p>Creator Allocation</p>
                    <div className="min-w-0 max-w-full">
                      <p className="truncate">
                        {creatorSupplyTokens.toLocaleString()} {form.symbol || "SYMBOL"}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{amountInWords(creatorSupplyTokens)}</p>
                    </div>

                    <p>Deposit (Token A)</p>
                    <div className="min-w-0 max-w-full">
                      <p className="truncate">
                        {amountInText && amountInText.trim() !== "" ? amountInText : "—"}{" "}
                        {tokenIn?.symbol || tokenIn?.name || "ETH"}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">
                        {tokenIn?.address ? `from ${shortAddr(tokenIn.address)}` : "native deposit"}
                        {tokenIn?.standard === "ERC6909" && typeof tokenIn?.id !== "undefined"
                          ? ` • id ${tokenIn.id.toString()}`
                          : ""}
                      </p>
                    </div>

                    <p>{isHook ? "Hook" : "Swap Fee"}</p>
                    <div className="min-w-0 max-w-full">
                      {isHook ? (
                        <p className="truncate">Hook ID #{feeOrHook?.toString() || "—"}</p>
                      ) : (
                        <p className="truncate">
                          {typeof feeBps === "number" ? `${feeBps} bps (${(feeBps / 100).toFixed(2)}%)` : "—"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* /Meta & Stats */}
        </div>
      </div>
    </div>
  );
};
