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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coin</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Updated At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.coinsBalanceOf?.items?.map((bal) => (
                <TableRow key={bal.coinId}>
                  <Link
                    to={`/c/$coinId`}
                    params={{
                      coinId: bal.coinId,
                    }}
                  >
                    <TableCell>
                      {bal.coin.name}[{bal.coin.symbol}]({trunc(bal.coinId)})
                    </TableCell>
                  </Link>
                  <TableCell>
                    {parseFloat(
                      formatEther(BigInt(bal?.balance ?? "0")),
                    ).toFixed(5)}
                  </TableCell>
                  <TableCell>
                    {bal.updatedAt ? formatTimeAgo(Number(bal.updatedAt)) : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="activity">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Sender</TableHead>
                <TableHead>Block</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transferActivity.map((transfer) => (
                <TableRow key={transfer.id}>
                  <TableCell>
                    {parseFloat(
                      formatEther(BigInt(transfer?.amount ?? "0")),
                    ).toFixed(5)}{" "}
                    {transfer.coin.symbol}
                  </TableCell>
                  <TableCell>
                    {transfer.from?.address
                      ? trunc(transfer.from?.address)
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {transfer.to?.address ? trunc(transfer.to?.address) : "-"}
                  </TableCell>
                  <TableCell>
                    {transfer.sender?.address
                      ? trunc(transfer.sender?.address)
                      : "-"}
                  </TableCell>
                  <TableCell>{transfer.blockNumber}</TableCell>
                  <TableCell>
                    {formatTimeAgo(Number(transfer.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
