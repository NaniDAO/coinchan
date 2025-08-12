import { ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useGetAiMeta } from "@/hooks/use-get-ai-meta";

type AiMetaCardProps = {
  address: string;
  id?: string;
  title?: string;
};

export default function AiMetaCard({ address, id, title }: AiMetaCardProps) {
  const { data: ai, isLoading, error } = useGetAiMeta(address, id);
  console.log("useGetAiMeta", {
    ai,
    isLoading,
    error,
  });
  return (
    <div className="px-5 items-center w-full flex justify-between flex-row">
      {!isLoading && !error && ai && (
        <>
          {ai.description && (
            <div className="flex items-center justify-center space-x-1">
              <ChevronRight className="h-5 w-5" aria-hidden />
              <p className="italic text-sm leading-relaxed">{ai.description}</p>
            </div>
          )}

          {ai.tags && ai.tags.length > 0 && (
            <div className="flex flex-row flex-wrap gap-2">
              {ai.tags.map((t) => (
                <Badge key={t} variant="secondary" className="rounded-full">
                  {t}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
