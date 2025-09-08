import * as React from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronsUpDown,
  ChevronRight,
  Plus,
  Filter,
  ExternalLink,
  Wallet,
  RefreshCcw,
  Coins,
  PlusIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { ProtocolId } from "@/lib/protocol";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import TopPoolsByTVLSection from "@/components/pools/TopTVLPools";
import { UserLpPositions } from "@/components/pools/UserLpPositions";
import { useAccount } from "wagmi";

export const Route = createFileRoute("/positions/")({
  component: RouteComponent,
});

const DEFAULT_STATUS = {
  active: true,
  closed: false,
};

const DEFAULT_PROTOCOLS: { [key: ProtocolId]: boolean } = {
  ZAMMV0: true,
  ZAMMV1: true,
};

function RouteComponent() {
  const { address: userAddress } = useAccount();
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [protocols, setProtocols] = useState(DEFAULT_PROTOCOLS);

  return (
    <div className="min-h-[calc(100vh-56px)] px-6 bg-background text-foreground grid grid-cols-5">
      <section className="col-span-3">
        <h2 className="text-2xl">Your positions</h2>
        <div className="mt-4 flex flex-row gap-1">
          <Button>
            <PlusIcon size={12} />
            <span>New</span>
          </Button>
          <Popover>
            <PopoverTrigger>
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
                <Checkbox id="status-active" />
                <Label htmlFor="status-active">Active</Label>
              </div>
              <div className="flex justify-between w-full items-center">
                <Checkbox id="status-closed" />
                <Label htmlFor="status-closed">Closed</Label>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger>
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
                <Checkbox id="zammv0" />
                <Label htmlFor="zammv0">ZAMM V0</Label>
              </div>
              <div className="flex justify-between w-full items-center">
                <Checkbox id="zammv1" />
                <Label htmlFor="zammv1">ZAMM V1</Label>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        {userAddress ? (
          <UserLpPositions address={userAddress} />
        ) : (
          <div>
            <div className="flex flex-col items-center justify-center h-full">
              <p className="text-center">
                Connect your wallet to view your positions
              </p>
            </div>
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
