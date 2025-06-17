import { AccountTransfer } from "@/hooks/use-get-account";
import { formatTimeAgo } from "@/lib/date";
import { trunc } from "@/lib/utils";
import { formatEther } from "viem";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Helper function to format addresses with better truncation for table display
const formatAddress = (address: string | null | undefined): string => {
  if (!address) return "-";
  // Use longer truncation for better readability in tables
  return trunc(address, 6); // Shows more characters: 0x1234...5678 instead of 0x123...678
};

export const ActivityTable = ({ data }: { data: AccountTransfer[] }) => {
  return (
    <div style={{ 
      border: '2px solid var(--terminal-black)', 
      background: 'var(--terminal-white)',
      margin: '20px 0' 
    }}>
      <Table>
        <TableHeader>
          <TableRow style={{ background: 'var(--terminal-black)' }}>
            <TableHead style={{ 
              color: 'var(--terminal-white)', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 'bold',
              padding: '12px 8px',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}>Amount</TableHead>
            <TableHead style={{ 
              color: 'var(--terminal-white)', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 'bold',
              padding: '12px 8px',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}>From</TableHead>
            <TableHead style={{ 
              color: 'var(--terminal-white)', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 'bold',
              padding: '12px 8px',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}>To</TableHead>
            <TableHead style={{ 
              color: 'var(--terminal-white)', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 'bold',
              padding: '12px 8px',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}>Sender</TableHead>
            <TableHead style={{ 
              color: 'var(--terminal-white)', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 'bold',
              padding: '12px 8px',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}>Block</TableHead>
            <TableHead style={{ 
              color: 'var(--terminal-white)', 
              fontFamily: 'var(--font-body)', 
              fontWeight: 'bold',
              padding: '12px 8px',
              fontSize: '12px',
              textTransform: 'uppercase'
            }}>Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((transfer, index) => (
            <TableRow 
              key={transfer.id}
              style={{ 
                background: index % 2 === 0 ? 'var(--terminal-white)' : 'var(--terminal-gray)',
                borderBottom: '1px solid var(--terminal-black)'
              }}
            >
              <TableCell style={{ 
                fontFamily: 'var(--font-body)', 
                padding: '12px 8px',
                fontSize: '13px',
                fontWeight: 'bold',
                color: 'var(--terminal-black)'
              }}>
                {parseFloat(formatEther(BigInt(transfer?.amount ?? "0"))).toFixed(5)} {transfer?.coin?.symbol}
              </TableCell>
              <TableCell style={{ 
                fontFamily: 'monospace', 
                padding: '12px 8px',
                fontSize: '12px',
                color: 'var(--terminal-black)',
                minWidth: '120px'
              }}>
                {formatAddress(transfer?.from?.address)}
              </TableCell>
              <TableCell style={{ 
                fontFamily: 'monospace', 
                padding: '12px 8px',
                fontSize: '12px',
                color: 'var(--terminal-black)',
                minWidth: '120px'
              }}>
                {formatAddress(transfer?.to?.address)}
              </TableCell>
              <TableCell style={{ 
                fontFamily: 'monospace', 
                padding: '12px 8px',
                fontSize: '12px',
                color: 'var(--terminal-black)',
                minWidth: '120px'
              }}>
                {formatAddress(transfer?.sender?.address)}
              </TableCell>
              <TableCell style={{ 
                fontFamily: 'var(--font-body)', 
                padding: '12px 8px',
                fontSize: '13px',
                color: 'var(--terminal-black)'
              }}>
                {transfer?.blockNumber}
              </TableCell>
              <TableCell style={{ 
                fontFamily: 'var(--font-body)', 
                padding: '12px 8px',
                fontSize: '12px',
                color: 'var(--terminal-black)',
                minWidth: '80px'
              }}>
                {formatTimeAgo(Number(transfer?.createdAt))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
