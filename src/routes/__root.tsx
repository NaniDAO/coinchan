import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ZammLogo } from "@/components/ZammLogo";
import { createRootRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogoClick = () => {
      navigate({ to: '/landing' });
    };

    // Check if we're on landing page
    if (location.pathname === '/landing') {
      return <Outlet />;
    }

    return (
      <div className="terminal-window">
        <div className="window-header">
          <div style={{ width: '60px' }}></div>
          <div>═══════════ ZAMM DeFi v1.0 ═══════════</div>
          <div style={{ width: '60px' }}></div>
        </div>

        <div className="window-content">
          {/* App Header */}
          <div className="app-header">
            <div className="app-logo">
              <ZammLogo size="medium" onClick={handleLogoClick} />
            </div>
            <div className="wallet-section">
              <ConnectMenu />
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>

          {/* Terminal Navigation Bar */}
          <div className="nav-bar">
            <Link
              to="/"
              className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}
            >
              SWAP
            </Link>
            <Link
              to="/explore"
              className={`nav-item ${location.pathname === '/explore' ? 'active' : ''}`}
            >
              COINS
            </Link>
            <Link
              to="/orders"
              className={`nav-item ${location.pathname === '/orders' ? 'active' : ''}`}
            >
              ORDERS
            </Link>
            <Link
              to="/send"
              className={`nav-item ${location.pathname === '/send' ? 'active' : ''}`}
            >
              SEND
            </Link>
            <Link
              to="/launch"
              className={`nav-item ${location.pathname === '/launch' ? 'active' : ''}`}
            >
              LAUNCH
            </Link>
          </div>

          {/* Page Content */}
          <div className="app-page">
            <Outlet />
          </div>
        </div>

        {/* Ticker Tape */}
        <div className="ticker">
          <div className="ticker__track">
            <span className="ticker__item">ZAMM Ξ2.53</span>
            <span className="ticker__item">ETH Ξ3,142.85</span>
            <span className="ticker__item">WBTC Ξ98,234.00</span>
            <span className="ticker__item">DAI Ξ1.00</span>
            <span className="ticker__item">USDC Ξ1.00</span>
            {/* Repeat for seamless loop */}
            <span className="ticker__item">ZAMM Ξ2.53</span>
            <span className="ticker__item">ETH Ξ3,142.85</span>
            <span className="ticker__item">WBTC Ξ98,234.00</span>
            <span className="ticker__item">DAI Ξ1.00</span>
            <span className="ticker__item">USDC Ξ1.00</span>
          </div>
        </div>
      </div>
    );
  },
});
