import { useTranslation } from "react-i18next";

interface SwapErrorProps {
  message: string;
}

export const SwapError = ({ message }: SwapErrorProps) => {
  const { t } = useTranslation();
  let errorMessage = message;
  if (message.includes("User rejected the request.")) {
    errorMessage = t("errors.user_denied");
  }

  return (
    <div className="text-sm text-destructive mt-2 bg-background/50 p-2 rounded border border-destructive/20 break-words">
      {errorMessage}
    </div>
  );
};
