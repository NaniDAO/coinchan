import { createFileRoute } from "@tanstack/react-router";
import { ZammLogo } from "@/components/ZammLogo";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

function RouteComponent() {
  const handleLogoClick = () => {
    // Logo animation handled by ZammLogo component
  };

  return (
    <div>
      <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>
        ═══ ABOUT ZAMM ═══
      </h2>

      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', margin: '20px 0' }}>
          <ZammLogo 
            size="large" 
            onClick={handleLogoClick}
          />
        </div>

        <p style={{ margin: '20px 0' }}>
          ZAMM is a decentralized automated market maker (AMM) protocol
          built for the modern DeFi ecosystem. Inspired by the simplicity
          and elegance of early computing interfaces, ZAMM brings fair
          launches and minimal fees to everyone.
        </p>

        <div className="ascii-divider">
          ════════════════════════════════════
        </div>

        <h3 style={{ margin: '20px 0' }}>FEATURES:</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li>▸ Fair launch sandbox</li>
          <li>▸ Community governance</li>
          <li>▸ Hyperoptimized for L1</li>
        </ul>

        <div className="ascii-divider">
          ════════════════════════════════════
        </div>

        <p style={{ textAlign: 'center', margin: '30px 0' }}>
          <button 
            className="button"
            onClick={() => {
              const newWindow = window.open('https://docs.zamm.eth.limo', '_blank');
              if (newWindow) newWindow.opener = null;
            }}
            style={{ margin: '5px' }}
          >
            DOCS
          </button>
          <button 
            className="button"
            onClick={() => {
              const newWindow = window.open('https://wp.zamm.eth.limo', '_blank');
              if (newWindow) newWindow.opener = null;
            }}
            style={{ margin: '5px' }}
          >
            WHITEPAPER
          </button>
          <button 
            className="button"
            onClick={() => {
              const newWindow = window.open('https://github.com/zamm-protocol', '_blank');
              if (newWindow) newWindow.opener = null;
            }}
            style={{ margin: '5px' }}
          >
            GITHUB
          </button>
          <button 
            className="button"
            onClick={() => {
              const newWindow = window.open('https://discourse.zamm.eth.limo', '_blank');
              if (newWindow) newWindow.opener = null;
            }}
            style={{ margin: '5px' }}
          >
            DISCOURSE
          </button>
        </p>
      </div>
    </div>
  );
}