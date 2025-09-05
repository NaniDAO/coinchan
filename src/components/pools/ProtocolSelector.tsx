import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dispatch, SetStateAction } from "react";

export const protocols = [
  { id: "ZAMMV1", label: "zamm V1 position" },
  { id: "ZAMMV2", label: "zamm V2 position" },
] as const;

export type ProtocolOption = (typeof protocols)[number];
export type ProtocolId = ProtocolOption["id"];

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
