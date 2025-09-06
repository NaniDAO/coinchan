import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProtocolId, protocols } from "@/lib/protocol";
import type { Dispatch, SetStateAction } from "react";

export interface ProtocolSelectorProps {
  protocolId: ProtocolId;
  setProtocolId: Dispatch<SetStateAction<ProtocolId>>;
  className?: string;
}

export function ProtocolSelector({
  protocolId,
  setProtocolId,
  className,
}: ProtocolSelectorProps) {
  return (
    <Select value={protocolId} onValueChange={setProtocolId}>
      <SelectTrigger className={className} aria-label="Select protocol">
        <SelectValue placeholder="Select protocol" />
      </SelectTrigger>
      <SelectContent>
        {protocols.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
