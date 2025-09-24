import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heading } from "@/components/ui/typography";
import { templates } from "./RaiseForm";

export const PreviewRaise = ({
  state,
  imageBuffer,
  ethRate,
  otcSupply,
  incentiveAmount,
  airdropIncentive,
  airdropPriceX18,
  incentiveDuration,
}: {
  state: any;
  imageBuffer: ArrayBuffer | null;
  ethRate: bigint;
  otcSupply: bigint;
  incentiveAmount: bigint;
  airdropIncentive: bigint;
  airdropPriceX18: bigint;
  incentiveDuration: bigint;
}) => {
  return (
    <div>
      <Heading level={2}>Preview</Heading>
      <div className="mt-4">
        <div className="mb-4 flex flex-row justify-between items-center">
          <Avatar className="rounded-md mr-4 h-50 w-50">
            <AvatarImage
              src={
                imageBuffer
                  ? URL.createObjectURL(new Blob([imageBuffer]))
                  : undefined
              }
              alt={state.name + " avatar"}
            />
            <AvatarFallback className="rounded-md">
              {state?.name?.charAt(0)?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="w-full flex flex-col items-start justify-start">
            <div>
              <div>{state.name}</div>
              <div>[{state.symbol}]</div>
            </div>
            <div>{state.description}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <InfoPill title="ethRate (×1e18)" value={ethRate.toString()} />
          <InfoPill title="otcSupply (wei)" value={otcSupply.toString()} />
          {templates[state.template].needsChef && (
            <InfoPill
              title="incentiveAmount (wei)"
              value={incentiveAmount.toString()}
            />
          )}
          {templates[state.template].needsAirdrop && (
            <>
              <InfoPill
                title="airdropIncentive (wei)"
                value={airdropIncentive.toString()}
              />
              <InfoPill
                title="airdropPriceX18"
                value={airdropPriceX18.toString()}
              />
            </>
          )}
          {templates[state.template].needsChef && (
            <InfoPill
              title="incentiveDuration (sec)"
              value={incentiveDuration.toString()}
            />
          )}
        </div>
      </div>
    </div>
  );
};

function InfoPill({ title, value }: { title: string; value: string }) {
  return (
    <div className="p-3 rounded-xl bg-muted/60 border text-xs flex flex-col">
      <div className="text-muted-foreground">{title}</div>
      <div className="font-mono break-all">{value}</div>
    </div>
  );
}
