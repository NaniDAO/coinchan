import { CheckIcon } from "lucide-react";

export const SuccessMessage = () => {
  return (
    <div className="text-sm text-chart-2 mt-2 flex items-center bg-background/50 p-2 rounded border border-chart-2/20">
      <CheckIcon className="h-3 w-3 mr-2" />
      Transaction confirmed!
    </div>
  );
};
