import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccountCoinsBalanceOf } from "@/hooks/use-get-account"; // Assuming AccountResult is the type returned by useGetAccount
import { formatTimeAgo } from "@/lib/date";
import { trunc } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { formatEther } from "viem";

interface CoinBalanceTableProps {
  data: AccountCoinsBalanceOf[];
}

export function CoinBalanceTable({ data }: CoinBalanceTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Coin</TableHead>
          <TableHead>Balance</TableHead>
          <TableHead>Updated At</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((bal) => (
          <TableRow key={bal.coinId}>
            <Link
              to={`/c/$coinId`}
              params={{
                coinId: bal.coinId,
              }}
            >
              <TableCell>
                {bal?.coin?.name}[{bal?.coin?.symbol}]({trunc(bal?.coinId)})
              </TableCell>
            </Link>
            <TableCell>{Number.parseFloat(formatEther(BigInt(bal?.balance ?? "0"))).toFixed(5)}</TableCell>
            <TableCell>{bal?.updatedAt ? formatTimeAgo(Number(bal?.updatedAt)) : "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
