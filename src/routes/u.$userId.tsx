import { ActivityTable } from "@/components/ActivityTable";
import { CoinBalanceTable } from "@/components/CoinBalanceTable";
import ErrorFallback, { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountTransfer, useGetAccount } from "@/hooks/use-get-account";
import { formatTimeAgo } from "@/lib/date";
import { trunc } from "@/lib/utils";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { formatEther, getAddress } from "viem";

export const Route = createFileRoute("/u/$userId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { userId } = Route.useParams();
  const { data } = useGetAccount({
    address: getAddress(userId),
  });

  const transferActivity = useMemo(() => {
    const transfers: AccountTransfer[] = [];
    if (!data) return transfers;
    if (data?.transfersTo?.items?.length !== 0) {
      data?.transfersTo?.items?.forEach((transfer) => transfers.push(transfer));
    }
    if (data?.transfersFrom?.items?.length !== 0) {
      data?.transfersFrom?.items?.forEach((transfer) =>
        transfers.push(transfer),
      );
    }

    // sort transfers by timestamp
    transfers.sort((a, b) => parseInt(b.blockNumber) - parseInt(a.blockNumber));

    return transfers;
  }, [data]);

  return (
    <div className="p-2">
      <div></div>
      <Tabs defaultValue="coins">
        <TabsList>
          <TabsTrigger value="coins">Coins</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="coins">
          <ErrorBoundary
            fallback={
              <ErrorFallback errorMessage="Error rendering coin balance activity" />
            }
          >
            {data?.coinsBalanceOf?.items && (
              <CoinBalanceTable data={data?.coinsBalanceOf?.items} />
            )}
          </ErrorBoundary>
        </TabsContent>
        <TabsContent value="activity">
          <ErrorBoundary
            fallback={
              <ErrorFallback errorMessage="An error occurred while rendering activity data." />
            }
          >
            <ActivityTable data={transferActivity} />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
