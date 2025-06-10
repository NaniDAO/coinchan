import Coins from "@/Coins";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";

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

      <div style={{ margin: '20px 0' }}>
        <Input
          placeholder="Search coins..."
          className="w-full input-field"
        />
      </div>

      <div style={{ 
        display: 'flex', 
        gap: '10px', 
        margin: '20px 0',
        width: '100%'
      }}>
        <div
          className="feature-button"
          style={{ flex: 1 }}
          onClick={handleLaunch}
        >
          <span style={{ fontSize: '20px', color: 'var(--diamond-blue)' }}>+</span>
          <span>LAUNCH</span>
        </div>
        <div
          className="feature-button"
          style={{ flex: 1 }}
          onClick={handleSend}
        >
          <span style={{ fontSize: '18px', color: 'var(--diamond-pink)' }}>→</span>
          <span>SEND</span>
        </div>
      </div>
      
      <Coins />
    </div>
  );
}
