import { createFileRoute } from "@tanstack/react-router";
import { useAccount } from "wagmi";

export const Route = createFileRoute("/dashboard")({
  component: RouteComponent,
});

function RouteComponent() {
  const { address, isConnected } = useAccount();

  // Mock data for demo - will be replaced with real data
  const portfolioStats = {
    totalValue: 5432,
    totalPositions: 3,
    dayPnL: 12.3,
  };

  const mockBalances = [
    { token: "ZAMM", balance: "1,234.56", value: "$1,234", change: "+5.2%" },
    { token: "ETH", balance: "0.5432", value: "$1,698", change: "-2.1%" },
    { token: "USDC", balance: "500.00", value: "$500", change: "0.0%" },
  ];

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
        ═══ USER DASHBOARD ═══
      </h2>

      {!isConnected ? (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          border: '2px solid var(--terminal-black)',
          background: 'var(--terminal-gray)',
          margin: '20px 0'
        }}>
          <p>Connect your wallet to view your dashboard</p>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="stats-grid">
            <div className="stat-box">
              <div className="stat-label">PORTFOLIO VALUE</div>
              <div className="stat-value">${portfolioStats.totalValue.toLocaleString()}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">TOTAL POSITIONS</div>
              <div className="stat-value">{portfolioStats.totalPositions}</div>
            </div>
            <div className="stat-box">
              <div className="stat-label">24H P&L</div>
              <div className="stat-value" style={{ color: portfolioStats.dayPnL > 0 ? 'green' : 'red' }}>
                {portfolioStats.dayPnL > 0 ? '+' : ''}{portfolioStats.dayPnL}%
              </div>
            </div>
          </div>

          {/* LP Positions Section */}
          <h3 style={{ margin: '30px 0 20px' }}>LP POSITIONS</h3>
          <div className="position-card">
            <div className="position-header">
              <span>ETH/ZAMM</span>
              <span>$2,500</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: '45%' }}></div>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '10px',
              fontSize: '12px'
            }}>
              <span>APR: 24.5%</span>
              <span>Share: 0.45%</span>
            </div>
            <div style={{ marginTop: '10px' }}>
              <button className="button" style={{ fontSize: '12px', padding: '5px 10px' }}>
                ADD
              </button>
              <button className="button" style={{ fontSize: '12px', padding: '5px 10px', marginLeft: '10px' }}>
                REMOVE
              </button>
            </div>
          </div>

          {/* Token Balances Table */}
          <h3 style={{ margin: '30px 0 20px' }}>TOKEN BALANCES</h3>
          <table className="table">
            <thead>
              <tr>
                <th>TOKEN</th>
                <th>BALANCE</th>
                <th>VALUE</th>
                <th>24H</th>
              </tr>
            </thead>
            <tbody>
              {mockBalances.map((token, index) => (
                <tr key={index}>
                  <td>{token.token}</td>
                  <td>{token.balance}</td>
                  <td>{token.value}</td>
                  <td style={{ color: token.change.startsWith('+') ? 'green' : token.change.startsWith('-') ? 'red' : 'inherit' }}>
                    {token.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {address && (
            <div style={{ 
              marginTop: '30px', 
              padding: '15px', 
              background: 'var(--terminal-gray)',
              border: '2px solid var(--terminal-black)',
              fontSize: '12px'
            }}>
              <strong>Wallet Address:</strong>
              <div className="wallet-address" style={{ marginTop: '5px' }}>
                {address}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}