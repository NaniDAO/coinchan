import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useGetAiMeta } from "@/hooks/use-get-ai-meta";
import { useGetMetadata } from "@/hooks/use-get-metadata";
import { Address } from "viem";

type AiMetaCardProps = {
  address: Address;
  id?: string;
  title?: string;
};

export default function AiMetaCard({ address, id }: AiMetaCardProps) {
  const { data: ai, isLoading, error } = useGetAiMeta(address, id);
  const { data: metadata } = useGetMetadata(address, id);

  return (
    <div className="px-5 items-center w-full flex justify-between flex-row">
      {!isLoading && !error && ai && (
        <>
          {ai.description && (
            <div className="flex items-center space-x-1">
              <ChevronRight className="h-5 w-5" aria-hidden />
              <p className="italic text-sm leading-relaxed">{ai.description}</p>
            </div>
          )}

          <div className="flex flex-row flex-wrap gap-2">
            {ai.tags &&
              ai.tags.length > 0 &&
              ai.tags.map((t) => (
                <Badge key={t} variant="secondary" className="rounded-full">
                  {t}
                </Badge>
              ))}

            {metadata?.properties &&
              Object.entries(metadata.properties).map(([key, value]) => (
                <Badge key={key} variant="outline" className="w-fit text-xs">
                  {key}:{String(value)}
                </Badge>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
