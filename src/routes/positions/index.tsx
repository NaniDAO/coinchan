import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProtocolId } from "@/lib/protocol";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import TopPoolsByTVLSection from "@/components/pools/TopTVLPools";
import { UserLpPositions } from "@/components/pools/UserLpPositions";
import { useAccount } from "wagmi";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PlusIcon } from "lucide-react";

export const Route = createFileRoute("/positions/")({
  component: RouteComponent,
});

const DEFAULT_STATUS = {
  active: true,
  closed: false,
};

const DEFAULT_PROTOCOLS: { [key in ProtocolId]: boolean } = {
  ZAMMV0: true,
  ZAMMV1: true,
};

function RouteComponent() {
  const { address: userAddress } = useAccount();
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [protocols, setProtocols] = useState(DEFAULT_PROTOCOLS);

  const onToggleStatus = (key: "active" | "closed", value: boolean) => setStatus((s) => ({ ...s, [key]: value }));

  const onToggleProtocol = (key: ProtocolId, value: boolean) => setProtocols((p) => ({ ...p, [key]: value }));

  const revealHidden = () => {
    // Show *everything*: both statuses + both protocols
    setStatus({ active: true, closed: true });
    setProtocols({ ZAMMV0: true, ZAMMV1: true });
  };

  return (
    <div className="min-h-[calc(100vh-56px)] px-6 bg-background text-foreground grid grid-cols-5">
      <section className="col-span-3 pb-8">
        <h2 className="text-2xl">Your positions</h2>

        {/* Controls */}
        <div className="mt-4 flex flex-row gap-1">
          <Button>
            <PlusIcon size={12} />
            <span>New</span>
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Status</Button>
            </PopoverTrigger>
            <PopoverContent
              className={cn(
                "w-[180px] p-2 mt-1 rounded-md flex flex-col gap-2",
                "border-2 border-border bg-background",
                "shadow-[6px_6px_0_var(--color-border)]",
              )}
            >
              <div className="flex justify-between w-full items-center">
                <Checkbox
                  id="status-active"
                  checked={status.active}
                  onCheckedChange={(v) => onToggleStatus("active", !!v)}
                />
                <Label htmlFor="status-active">Active</Label>
              </div>
              <div className="flex justify-between w-full items-center">
                <Checkbox
                  id="status-closed"
                  checked={status.closed}
                  onCheckedChange={(v) => onToggleStatus("closed", !!v)}
                />
                <Label htmlFor="status-closed">Closed</Label>
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Protocol</Button>
            </PopoverTrigger>
            <PopoverContent
              className={cn(
                "w-[180px] p-2 mt-1 rounded-md flex flex-col gap-2",
                "border-2 border-border bg-background",
                "shadow-[6px_6px_0_var(--color-border)]",
              )}
            >
              <div className="flex justify-between w-full items-center">
                <Checkbox
                  id="zammv0"
                  checked={protocols.ZAMMV0}
                  onCheckedChange={(v) => onToggleProtocol("ZAMMV0", !!v)}
                />
                <Label htmlFor="zammv0">ZAMM V0</Label>
              </div>
              <div className="flex justify-between w-full items-center">
                <Checkbox
                  id="zammv1"
                  checked={protocols.ZAMMV1}
                  onCheckedChange={(v) => onToggleProtocol("ZAMMV1", !!v)}
                />
                <Label htmlFor="zammv1">ZAMM V1</Label>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* List */}
        {userAddress ? (
          <UserLpPositions
            address={userAddress}
            limit={12}
            statuses={status}
            protocols={protocols}
            revealHidden={revealHidden}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <p className="text-center">Connect your wallet to view your positions</p>
          </div>
        )}
      </section>

      <div className="col-span-2">
        <TopPoolsByTVLSection />
      </div>
    </div>
  );
}

export default RouteComponent;
