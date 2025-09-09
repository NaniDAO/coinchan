import { Badge } from "@/components/ui/badge";
import { bpsToPct } from "@/lib/pools";
import { ProtocolId } from "@/lib/protocol";

export const ProtocolFeeBadges = ({
  protocolId,
  fee,
}: {
  protocolId: ProtocolId | null;
  fee: number | null;
}) => {
  return (
    <div>
      {protocolId !== null && <Badge variant="secondary">{protocolId === "ZAMMV0" ? "v0" : "v1"}</Badge>}
      {fee !== null && <Badge variant="secondary">{bpsToPct(fee)}</Badge>}
    </div>
  );
};
