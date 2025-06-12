import { SendTile } from "@/SendTile";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/send")({
  component: RouteComponent,
});

function RouteComponent() {

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
        ═══ SEND COINS ═══
      </h2>

      <div className="ascii-divider">════════════════════════════════════</div>
      
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '20px 0'
      }}>
        <div style={{ 
          width: '100%', 
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <SendTile />
        </div>
      </div>
    </div>
  );
}
