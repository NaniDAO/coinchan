"use client";

import { ZDropsResponse } from "@/hooks/use-get-z-drops";
import { formatEther } from "viem";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Heading } from "./ui/typography";

export const ZDropsTable = ({
  zDrops,
}: {
  zDrops: {
    eligible: boolean;
    drops: ZDropsResponse;
  };
}) => {
  const { eligible, drops } = zDrops;

  return (
    <div className=" p-2">
      <div>
        <Heading level={2}>Your zDrops</Heading>
        <p className="mt-2 text-sm text-muted-foreground">
          You need to hold <span className="font-medium">veZAMM</span> to claim
          airdrops.
        </p>
        {!eligible && (
          <p className="text-sm text-red-500 mt-1">
            You are not currently eligible. veZAMM balance required.
          </p>
        )}
      </div>
      <div>
        <Table>
          <TableCaption>
            {drops.items.length === 0
              ? "No active zDrops found."
              : `Showing ${drops.items.length} of ${drops.totalCount} zDrops`}
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Block</TableHead>
              <TableHead>Token In</TableHead>
              <TableHead>Token Out</TableHead>
              <TableHead>Amount In</TableHead>
              <TableHead>Amount Out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tx Hash</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drops.items.map((drop) => (
              <TableRow key={drop.id}>
                <TableCell>{drop.blockNumber}</TableCell>
                <TableCell>{drop.tokenIn}</TableCell>
                <TableCell>{drop.tokenOut}</TableCell>
                <TableCell>{formatEther(BigInt(drop.amtIn))}</TableCell>
                <TableCell>{formatEther(BigInt(drop.amtOut))}</TableCell>
                <TableCell>
                  <Badge variant="outline">{drop.status}</Badge>
                </TableCell>
                <TableCell>
                  <a
                    href={`https://etherscan.io/tx/${drop.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {drop.txHash.slice(0, 6)}...{drop.txHash.slice(-4)}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
