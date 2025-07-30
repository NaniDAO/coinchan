import { Sale } from "@/hooks/use-zcurve-sales";

/**
 * Returns funding progress in the human range [0, 100]
 */
export const calculateFundedPercentage = (sale: Sale): number => {
  try {
    if (sale.status === "FINALIZED") return 100;

    /* From the indexer: 10 000 = 100 % */
    const funded = typeof sale.percentFunded === "bigint" ? Number(sale.percentFunded) : (sale.percentFunded ?? 0);

    if (funded) return Math.min(funded / 100, 100);

    const escrow = BigInt(sale.ethEscrow ?? 0);
    const target = BigInt(sale.ethTarget ?? 0);
    if (target === 0n) return 0;

    return Number((escrow * 10_000n) / target) / 100;
  } catch (err) {
    console.error("calculateFundedPercentage()", err, sale);
    return 0;
  }
};
