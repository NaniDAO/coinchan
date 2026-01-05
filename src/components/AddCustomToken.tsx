import { memo, useEffect, useState } from "react";
import { type Address } from "viem";
import { useTranslation } from "react-i18next";
import { useErc20Metadata } from "@/hooks/use-erc20-metadata";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import { TokenImage } from "./TokenImage";

interface AddCustomTokenProps {
  address: Address;
  onAdd: () => void;
  existsInList: boolean;
}

export const AddCustomToken = memo(({ address, onAdd, existsInList }: AddCustomTokenProps) => {
  const { t } = useTranslation();
  const { symbol, decimals, name, isLoading } = useErc20Metadata({
    tokenAddress: address,
  });
  const [error, setError] = useState<string | null>(null);

  const isValidErc20 = !isLoading && symbol && decimals !== undefined;

  useEffect(() => {
    if (!isLoading && !isValidErc20) {
      setError(t("tokenSelector.not_erc20"));
    } else if (existsInList) {
      setError(t("tokenSelector.already_added"));
    } else {
      setError(null);
    }
  }, [isLoading, isValidErc20, existsInList, t]);

  const handleAdd = () => {
    if (isValidErc20 && symbol && decimals !== undefined && name) {
      onAdd();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t("tokenSelector.validating_token")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (isValidErc20 && symbol && name) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 px-4">
        <div className="flex items-center gap-3 p-4 bg-muted rounded-lg w-full">
          <TokenImage symbol={symbol} imageUrl={null} />
          <div className="flex flex-col min-w-0 flex-1">
            <span className="font-medium truncate">{symbol}</span>
            <span className="text-xs text-muted-foreground truncate">{name}</span>
            <span className="text-xs text-muted-foreground">
              {decimals} {t("common.decimals", { defaultValue: "decimals" })}
            </span>
          </div>
        </div>
        <Button onClick={handleAdd} className="w-full">
          {t("tokenSelector.add_custom_token")}
        </Button>
        <p className="text-xs text-muted-foreground text-center">{address}</p>
      </div>
    );
  }

  return null;
});

AddCustomToken.displayName = "AddCustomToken";
