import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ZammLogo } from "@/components/ZammLogo";
import { PoolsTicker } from "@/components/PoolsTicker";
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
              to="/swap"
              className={`nav-item ${location.pathname === '/swap' ? 'active' : ''}`}
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
              to="/dashboard"
              className={`nav-item ${location.pathname === '/dashboard' ? 'active' : ''}`}
            >
              DASHBOARD
            </Link>
            <Link
              to="/about"
              className={`nav-item ${location.pathname === '/about' ? 'active' : ''}`}
            >
              ABOUT
            </Link>
          </div>

          {/* Page Content */}
          <div className="app-page">
            <Outlet />
          </div>
        </div>

        {/* Pools Ticker at bottom */}
        <PoolsTicker />
      </div>
    );
  },
});
