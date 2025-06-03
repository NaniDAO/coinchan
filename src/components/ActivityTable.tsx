import { AccountTransfer } from "@/hooks/use-get-account";
import { formatTimeAgo } from "@/lib/date";
import { trunc } from "@/lib/utils";
import { formatEther } from "viem";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const ActivityTable = ({ data }: { data: AccountTransfer[] }) => {
  return (
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
        {data.map((transfer) => (
          <TableRow key={transfer.id}>
            <TableCell>
              {parseFloat(formatEther(BigInt(transfer?.amount ?? "0"))).toFixed(5)} {transfer?.coin?.symbol}
            </TableCell>
            <TableCell>{transfer?.from?.address ? trunc(transfer?.from?.address) : "-"}</TableCell>
            <TableCell>{transfer?.to?.address ? trunc(transfer?.to?.address) : "-"}</TableCell>
            <TableCell>{transfer?.sender?.address ? trunc(transfer?.sender?.address) : "-"}</TableCell>
            <TableCell>{transfer?.blockNumber}</TableCell>
            <TableCell>{formatTimeAgo(Number(transfer?.createdAt))}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
