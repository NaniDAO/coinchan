import { Alert, AlertDescription } from "../ui/alert";
import { Info } from "lucide-react";

export const WlfiFarmTab = () => {

  return (
    <div className="space-y-4">
      {/* Info Alert with black and gold theme */}
      <Alert className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border-yellow-500/30">
        <Info className="h-4 w-4 text-yellow-400" />
        <AlertDescription className="text-yellow-400/80">
          No active farms for WLFI at the moment. Check back later for farming opportunities!
        </AlertDescription>
      </Alert>
    </div>
  );
};