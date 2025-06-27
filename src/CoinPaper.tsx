import { Link } from "@tanstack/react-router";

const stats = [
  { label: "Total Supply", value: "21 000 000", emoji: "💰" },
  { label: "Swap Fee", value: "1 %", emoji: "💱" },
  { label: "Vesting", value: "6 months", emoji: "⏰" },
  { label: "Pool Supply", value: "21 000 000", emoji: "🏦" },
];

export const CoinPaper = () => (
  <div className="w-screen flex items-center justify-center">
    <div className="w-full md:max-w-4xl">
      <h1 className="text-4xl font-bold text-foreground mb-8 font-display">Coinpaper</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, emoji }) => (
          <div
            key={label}
            className="bg-card text-card-foreground border-2 border-border p-4 hover:bg-muted transition-colors"
          >
            <span className="text-2xl mb-2 block">{emoji}</span>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">{label}</div>
              <div className="text-lg font-bold">{value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="explanation">
        <p className="leading-paragraph">
          <strong className="text-red-700">Coinchan</strong> is a ruthlessly optimized coin launcher for Ethereum via
          the <strong className="text-red-700">ERC6909</strong> standard. All <em>21 000 000</em> tokens are initially
          locked in an AMM pool for fair distribution while creators earn swap fees. Sound good?
        </p>
        <ul className="feature-list">
          <li>
            <strong className="text-red-700">Total Supply:</strong> Fixed at 21 000 000 — no more can ever be minted.
          </li>
          <li>
            <strong className="text-red-700">Pool Supply:</strong> 100% of coins go straight into the liquidity pool —
            everyone trades on the same footing.
          </li>
          <li>
            <strong className="text-red-700">Swap Fee:</strong> A 1% fee is taken on each trade by the AMM which goes
            back to the creator.
          </li>
          <li>
            <strong className="text-red-700">Vesting:</strong> Creator LP tokens are linearly vested over 6 months to
            prove long‑term commitment.
          </li>
          <li>
            <strong className="text-red-700">ERC6909:</strong> Extends ERC20 with singleton state (one contract, all
            coins), metadata (tokenURI) support, and backwards compatibility with existing ERC20 DeFi.
          </li>
        </ul>
      </div>

      <div className="py-3 px-6">
        <Link
          to="/launch"
          className="bg-primary/10 hover:bg-primary dark:bg-secondary/10 dark:hover:bg-secondary text-white font-bold rounded-lg transition-all shadow-md hover:shadow-lg"
        >
          I want to coin it!
        </Link>
      </div>
    </div>
  </div>
);
