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
        gap: '12px', 
        margin: '20px 0',
        width: '100%',
        justifyContent: 'center'
      }}>
        <button
          className="button"
          onClick={handleLaunch}
          style={{ 
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '16px', color: 'var(--diamond-blue)' }}>+</span>
          LAUNCH
        </button>
        
        <button
          className="button"
          onClick={handleSend}
          style={{ 
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '16px', color: 'var(--diamond-pink)' }}>→</span>
          SEND
        </button>
      </div>
      
      <div className="ascii-divider">════════════════════════════════════</div>
      
      <Coins />
    </div>
  );
}
