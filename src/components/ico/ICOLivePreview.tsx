import { amountInWords } from "@/lib/math";
import { ICOForm } from ".";
import { Avatar, AvatarImage } from "../ui/avatar";
import { Heading } from "../ui/typography";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

interface ICOLivePreviewProps {
  form: ICOForm;
  imagePreviewUrl: string;
  coinId?: string;
  chefId?: string;
}

export const ICOLivePreview = ({
  form,
  imagePreviewUrl,
  coinId,
  chefId,
}: ICOLivePreviewProps) => {
  const { t } = useTranslation();
  const totalSupply = 1_000_000_000;
  const poolAllocation = 1_000_000; // 0.1%
  const lpMiningAllocation = 900_000_000; // 90%
  const airdropAllocation = 99_000_000; // 9.9%
  const creatorAllocation = 0; // Fair launch

  const feeBps = form.feeOrHook;
  const feePercent = feeBps / 100;

  return (
    <div className="lg:sticky lg:top-4 lg:self-start max-h-fit overflow-y-auto pb-6 bg-muted mb-2 p-2">
      <div>
        <Heading level={2}>{t("ico.preview")}</Heading>
        <p className="mt-1 text-muted-foreground">{t("ico.preview_hint")}</p>
      </div>

      <div>
        <div className="flex flex-col items-center justify-center">
          {/* Image */}
          <div className="w-full flex items-center justify-center">
            <div>
              <Avatar className="rounded-md mt-4 h-12 w-12 lg:h-48 lg:w-48">
                <AvatarImage
                  src={imagePreviewUrl || "/zammzamm.png"}
                  alt={form.name || "ICO image"}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "https://placehold.co/800x800/png?text=Image+not+found";
                  }}
                />
              </Avatar>
              <p className="mt-2 text-xs text-center text-muted-foreground break-all">
                {imagePreviewUrl ? t("ico.local_preview") : t("ico.upload_an_image")}
              </p>
            </div>
          </div>

          {/* Meta & Stats */}
          <div className="w-full flex flex-col items-start justify-start px-4 mt-8">
            <div className="flex flex-row gap-2">
              {coinId && <p className="border-border border p-1 text-4xl">#{coinId}</p>}
              <div className="flex flex-row items-center gap-4">
                <Heading level={4} className="text-4xl font-bold tracking-tight">
                  {form.name || "Your Token Name"}
                </Heading>
                <span className="text-md text-muted-foreground">[{form.symbol ? `${form.symbol}` : "SYMBOL"}]</span>
              </div>
            </div>

            <p className="mt-1 ml-2 text-md text-muted-foreground whitespace-pre-wrap">
              {form.description || t("ico.title")}
            </p>

            {chefId && (
              <p className="mt-2 ml-2 text-sm text-primary">
                <Link to="/farm" className="underline hover:no-underline">
                  zChef
                </Link>{" "}
                ID: #{chefId}
              </p>
            )}

            {/* Token Distribution */}
            <div className="w-full mt-6 border-t border-border pt-4">
              <Heading level={4} className="font-bold mb-2">{t("ico.token_distribution")}</Heading>

              {/* Total Supply */}
              <div className="mt-3 bg-accent text-accent-foreground p-3 border border-border w-full rounded-md">
                <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-3 items-start w-full">
                  <p className="font-bold text-foreground">{t("ico.total_supply")}</p>
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-accent-foreground">
                      {totalSupply.toLocaleString()} {form.symbol || "SYMBOL"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{amountInWords(totalSupply)}</p>
                  </div>

                  <p className="font-bold text-foreground">{t("ico.initial_pool_allocation")}</p>
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-accent-foreground">
                      {poolAllocation.toLocaleString()} {form.symbol || "SYMBOL"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t("ico.paired_with_eth")}</p>
                  </div>

                  <p className="font-bold text-foreground">{t("ico.lp_mining_allocation")}</p>
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-accent-foreground">
                      {lpMiningAllocation.toLocaleString()} {form.symbol || "SYMBOL"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("ico.streamed_over_days", { days: form.incentiveDuration }).split("zChef")[0]}
                      <Link to="/farm" className="text-primary underline hover:no-underline">
                        zChef
                      </Link>
                      {t("ico.streamed_over_days", { days: form.incentiveDuration }).split("zChef")[1] || ""}
                    </p>
                  </div>

                  <p className="font-bold text-foreground">{t("ico.community_airdrop_allocation")}</p>
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-accent-foreground">
                      {airdropAllocation.toLocaleString()} {form.symbol || "SYMBOL"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">To <Link to="/c/$coinId" params={{ coinId: "87" }} className="text-primary underline hover:no-underline">veZAMM (87)</Link> holders</p>
                  </div>

                  <p className="font-bold text-foreground">{t("ico.creator_allocation_fair")}</p>
                  <div className="min-w-0 max-w-full">
                    <p className="truncate text-accent-foreground">{creatorAllocation} {form.symbol || "SYMBOL"}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t("ico.fair_launch_no_creator")}</p>
                  </div>
                </div>
              </div>

              {/* Pool Configuration */}
              <div className="mt-3 bg-accent text-accent-foreground p-3 border border-border w-full rounded-md">
                <p className="font-bold text-lg mb-3">{t("ico.pool_configuration")}</p>
                <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-3 items-start w-full">
                  <p className="font-semibold text-foreground">{t("ico.initial_liquidity")}</p>
                  <p className="text-accent-foreground">0.001 ETH ↔ 1,000,000 {form.symbol || "SYMBOL"}</p>

                  <p className="font-semibold text-foreground">{t("ico.initial_price")}</p>
                  <p className="text-accent-foreground">1 ETH = 1,000,000,000 {form.symbol || "SYMBOL"}</p>

                  <p className="font-semibold text-foreground">{t("ico.swap_fee")}</p>
                  <p className="text-accent-foreground">{feeBps} bps ({feePercent.toFixed(2)}%)</p>

                  <p className="font-semibold text-foreground">{t("ico.pool_type")}</p>
                  <p className="text-accent-foreground">zAMM ETH/{form.symbol || "SYMBOL"}</p>
                </div>
              </div>

              {/* Incentive Details */}
              <div className="mt-3 bg-accent text-accent-foreground p-3 border border-border w-full rounded-md">
                <p className="font-bold text-lg mb-3">{t("ico.incentive_structure")}</p>
                <div className="grid grid-cols-[max-content,1fr] gap-x-4 gap-y-3 items-start w-full">
                  <p className="font-semibold text-foreground">{t("ico.lp_staking")}</p>
                  <p className="text-accent-foreground">{t("ico.stake_lp_mine", { symbol: form.symbol || "SYMBOL" })}</p>

                  <p className="font-semibold text-foreground">{t("ico.mining_duration")}</p>
                  <p className="text-accent-foreground">{form.incentiveDuration} {t("common.days")}</p>

                  <p className="font-semibold text-foreground">{t("ico.daily_emission")}</p>
                  <p className="text-accent-foreground">{t("ico.tokens_per_day", { amount: Math.floor(lpMiningAllocation / form.incentiveDuration).toLocaleString(), symbol: form.symbol || "SYMBOL" })}</p>

                  <p className="font-semibold text-foreground">{t("ico.airdrop_exchange")}</p>
                  <p className="text-accent-foreground">{t("ico.exchange_rate", { symbol: form.symbol || "SYMBOL" }).split("veZAMM (87)")[0]}<Link to="/c/$coinId" params={{ coinId: "87" }} className="text-primary underline hover:no-underline">veZAMM (87)</Link></p>

                  <p className="font-semibold text-foreground">{t("ico.eth_zap")}</p>
                  <p className="text-accent-foreground">{t("ico.direct_eth_staking")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};