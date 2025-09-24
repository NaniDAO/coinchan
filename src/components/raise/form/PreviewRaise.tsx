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
  const imgUrl = imageBuffer
    ? URL.createObjectURL(new Blob([imageBuffer]))
    : null;

  const initial = (state?.name?.trim?.()?.charAt(0) || "Z").toUpperCase();

  return (
    <section
      className="
        h-fit rounded-2xl border bg-white/60 dark:bg-neutral-900/60
        shadow-sm backdrop-blur-sm overflow-hidden
      "
    >
      {/* header */}
      <div className="px-5 py-4 border-b bg-gradient-to-b from-transparent to-black/[0.02] dark:to-white/[0.02]">
        <h2 className="text-lg font-semibold tracking-tight">Preview</h2>
      </div>

      {/* identity row */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          {/* avatar / logo */}
          <div
            className="
              relative h-32 w-32 shrink-0 rounded-xl
              ring-1 ring-black/5 dark:ring-white/10
              bg-neutral-100 dark:bg-neutral-800
              grid place-items-center overflow-hidden
            "
          >
            {imgUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgUrl}
                alt={`${state.name || "Project"} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-semibold text-neutral-500">
                {initial}
              </span>
            )}
          </div>

          {/* name/symbol/desc */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold leading-tight truncate">
                {state.name || "Unnamed"}
              </div>
              <div className="text-sm px-2 py-0.5 rounded-md border bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300">
                [{state.symbol || "---"}]
              </div>
            </div>
            <p
              className="
                mt-1 text-sm text-neutral-600 dark:text-neutral-300
                whitespace-pre-wrap
              "
            >
              {state.description || "No description yet."}
            </p>
          </div>
        </div>
      </div>

      {/* stats */}
      <div className="px-5 pb-5">
        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-3">
          Tokenomics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <InfoStat title="ETH Rate (×1e18)" value={ethRate.toString()} />
          <InfoStat title="OTC Supply (wei)" value={otcSupply.toString()} />

          {/*@ts-expect-error */}
          {templates[state.template].needsChef && (
            <InfoStat
              title="Incentive Amount (wei)"
              value={incentiveAmount.toString()}
            />
          )}
          {/*@ts-expect-error */}
          {templates[state.template].needsAirdrop && (
            <>
              <InfoStat
                title="Airdrop Incentive (wei)"
                value={airdropIncentive.toString()}
              />
              <InfoStat
                title="Airdrop Price X18"
                value={airdropPriceX18.toString()}
              />
            </>
          )}
          {/*@ts-expect-error */}
          {templates[state.template].needsChef && (
            <InfoStat
              title="Incentive Duration (sec)"
              value={incentiveDuration.toString()}
            />
          )}
        </div>
      </div>
    </section>
  );
};

function InfoStat({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="
        p-4 rounded-xl border bg-white/70 dark:bg-neutral-900/70
        shadow-xs
      "
    >
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {title}
      </div>
      <div className="mt-1 font-mono text-xs break-all text-neutral-900 dark:text-neutral-50">
        {value || "—"}
      </div>
    </div>
  );
}
