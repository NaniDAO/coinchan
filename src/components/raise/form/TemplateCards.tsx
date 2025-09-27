import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function TemplateCards({
  onSelect,
  selectedKey,
}: {
  onSelect?: (key: string) => void;
  selectedKey?: string;
}) {
  const { t } = useTranslation();

  const videoTemplates = [
    {
      key: "kickstarter",
      title: t("raise.templates.fundraising"),
      video: "/templates/kickstarter.mp4",
    },
    {
      key: "kickstarter_chef",
      title: t("raise.templates.fundraising_with_incentives"),
      video: "/templates/kickstarter-zchef-airdrop.mp4",
    },
  ] as const;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {videoTemplates.map((tpl) => (
        <motion.div
          key={tpl.key}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect?.(tpl.key)}
        >
          <div
            className={cn(
              "relative overflow-hidden rounded-md shadow-lg cursor-pointer group border-0",
              selectedKey === tpl.key
                ? "outline-2 outline-offset-2 outline-border"
                : "",
            )}
          >
            <video
              src={tpl.video}
              autoPlay
              loop
              muted
              playsInline
              className="w-full h-64 object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
              <h3 className="text-white font-semibold text-lg drop-shadow-md">
                {tpl.title}
              </h3>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
