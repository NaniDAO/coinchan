import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { ZammLogo } from "@/components/ZammLogo";
import {
  createRootRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CoinNani } from "@/components/coinnani";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleLogoClick = () => {
      navigate({ to: "/landing" });
    };

    // Check if we're on landing page
    if (location.pathname === "/landing") {
      return <Outlet />;
    }

    return (
      <>
        <div className="terminal-window">
          <div className="window-header">
            <div style={{ width: "60px" }}></div>
            <div>═══════════ ZAMM DeFi v1.0 ═══════════</div>
            <div style={{ width: "60px" }}></div>
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
                className={`nav-item ${location.pathname === "/swap" ? "active" : ""}`}
              >
                SWAP
              </Link>
              <Link
                to="/explore"
                className={`nav-item ${location.pathname === "/explore" ? "active" : ""}`}
              >
                COINS
              </Link>
              <Link
                to="/dashboard"
                className={`nav-item ${location.pathname === "/dashboard" ? "active" : ""}`}
              >
                DASHBOARD
              </Link>
              <Link
                to="/about"
                className={`nav-item ${location.pathname === "/about" ? "active" : ""}`}
              >
                ABOUT
              </Link>
            </div>

            {/* Page Content */}
            <div className="app-page">
              <Outlet />
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <Sheet>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-2">
            <nav className="flex flex-col space-y-4 mt-8">
              <Link
                to="/"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                📈 {t("common.swap")}
              </Link>
              <Link
                to="/explore"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                🗺️ {t("common.explore")}
              </Link>
              <Link
                to="/orders"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                📋 {t("common.orders")}
              </Link>
              <Link
                to="/send"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                🪁 {t("common.send")}
              </Link>
              <Link
                to="/launch"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                🚀 {t("common.launch")}
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <CoinNani className="fixed bottom-4 right-4 z-10" />
        <Outlet />
      </>
    );
  },
});
