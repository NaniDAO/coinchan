import { TokenPage } from "@/components/explorer/token-page";
import { Token } from "@/lib/pools";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { getAddress, zeroAddress } from "viem";

export const Route = createFileRoute("/explore/token")({
  component: RouteComponent,
  validateSearch: (search: { address?: string; id?: string }) => search,
});

function RouteComponent() {
  const search = useSearch({ from: "/explore/token" });

  const token: Token = useMemo(() => {
    const { address, id } = search;

    return {
      address: address ? getAddress(address) : zeroAddress,
      id: id ? BigInt(id) : 0n,
    };
  }, [search]);

  return <TokenPage token={token} />;
}
