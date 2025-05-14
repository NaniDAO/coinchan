import { Address } from "viem";
import { blo } from "blo";
import { useMemo } from "react";

export function AddressIcon({
  address,
  className,
}: {
  address: Address;
  className?: string;
}) {
  const imageSrc = useMemo(() => blo(address), [address]);
  return <img alt={address} src={imageSrc} className={className} />;
}
