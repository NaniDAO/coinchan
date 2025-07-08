import { blo } from "blo";
import { useMemo } from "react";
import type { Address } from "viem";

export function AddressIcon({
  address,
  className,
}: {
  address: Address;
  className?: string;
}) {
  const imageSrc = useMemo(() => blo(address), [address]);
  return <img alt={address + " icon"} src={imageSrc} className={className} />;
}
