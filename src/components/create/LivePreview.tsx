import { amountInWords } from "@/lib/math";
import { SimpleForm } from ".";
import { Avatar, AvatarImage } from "../ui/avatar";
import { Heading } from "../ui/typography";

interface LivePreviewProps {
  coinId?: string;
  form: SimpleForm;
  imagePreviewUrl: string;
}

export const LivePreview = ({
  coinId,
  form,
  imagePreviewUrl,
}: LivePreviewProps) => {
  return (
    <div className="max-h-fit pb-6 bg-muted mb-2 p-2 relative overflow-hidden">
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
                    (e.currentTarget as HTMLImageElement).src =
                      "https://placehold.co/800x800/png?text=Image+not+found";
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
              {coinId && (
                <p className="border-border border p-1 text-4xl">{coinId}</p>
              )}
              <div className="flex flex-row items-center gap-4">
                <Heading
                  level={4}
                  className="text-4xl font-bold tracking-tight"
                >
                  {form.name || "Your Coin Name"}
                </Heading>
                <span className="text-md text-muted-foreground">
                  [{form.symbol ? `${form.symbol}` : "SYMBOL"}]
                </span>
              </div>
            </div>
            <p className="mt-1 ml-2 text-md text-muted-foreground whitespace-pre-wrap">
              {form.description || "yap about ye coin here"}
            </p>
            <div className="w-full mt-4">
              <Heading level={4} className="font-bold">
                Mechanics
              </Heading>
              <div className="mt-2 bg-accent text-accent-foreground p-2 border border-border w-full">
                <div className="grid grid-cols-[max-content,1fr] gap-x-4 items-start w-full">
                  <p className="whitespace-nowrap">Total Supply</p>

                  {/* value column */}
                  <div className="min-w-0 max-w-full">
                    {/* number + symbol: keep on one line if possible */}
                    <p className="truncate">
                      {form.supply || "0"} {form.symbol || "SYMBOL"}
                    </p>

                    {/* words: wrap and grow vertically, never widen the container */}
                    <p className="text-xs text-muted-foreground whitespace-normal break-words md:break-words break-all leading-snug">
                      {amountInWords(form?.supply || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
