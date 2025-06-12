import Coins from "@/Coins";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/explore")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const handleLaunch = () => {
    navigate({ to: '/launch' });
  };

  const handleSend = () => {
    navigate({ to: '/send' });
  };

  const handleOrders = () => {
    navigate({ to: '/orders' });
  };

  return (
    <div style={{ 
      padding: '20px 0',
      width: '100%',
      maxWidth: '100%'
    }}>
      <h2 style={{ 
        textAlign: 'center', 
        marginBottom: '20px',
        fontFamily: 'var(--font-display)',
        textTransform: 'uppercase',
        letterSpacing: '2px'
      }}>
        ═══ COIN EXPLORER ═══
      </h2>


      <div className="ascii-divider">════════════════════════════════════</div>
      
      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        margin: '20px 0',
        width: '100%',
        justifyContent: 'center'
      }}>
        <div 
          className="feature-button"
          onClick={handleLaunch}
          style={{ flex: 1, maxWidth: '150px' }}
        >
          <span style={{ fontSize: '20px', color: '#00d4ff' }}>+</span>
          <span>LAUNCH</span>
        </div>
        
        <div 
          className="feature-button"
          onClick={handleSend}
          style={{ flex: 1, maxWidth: '150px' }}
        >
          <span style={{ fontSize: '18px', color: '#ff6b9d' }}>→</span>
          <span>SEND</span>
        </div>

        <div 
          className="feature-button"
          onClick={handleOrders}
          style={{ flex: 1, maxWidth: '150px' }}
        >
          <span style={{ fontSize: '18px', color: '#ffe066' }}>📋</span>
          <span>ORDERS</span>
        </div>
      </div>
      
      <div className="ascii-divider">════════════════════════════════════</div>
      
      <Coins />
    </div>
  );
}
