import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import UserSettingsMenu from "@/components/UserSettingsMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link, Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { AnimatedLogo } from "@/components/AnimatedLogo";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogoClick = () => {
      // Always navigate to landing page
      navigate({ to: "/" });
      setIsMobileMenuOpen(false);
    };

    const handleMobileMenuToggle = () => {
      setIsMobileMenuOpen(!isMobileMenuOpen);
    };

    const handleNavClick = () => {
      setIsMobileMenuOpen(false);
    };

    const navLinks = [
      { to: "/swap", label: t("common.swap") },
      { to: "/explore", label: t("common.explore") },
      { to: "/coins", label: t("common.coins") },
      { to: "/farm", label: t("common.farm") },
    ];

    const navLinkClasses = (path: string) =>
      cn(
        "cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-widest hover:bg-accent hover:text-accent-foreground",
        "md:text-lg text-base px-3 py-2 md:py-0",
        location.pathname === path ? "active bg-accent text-accent-foreground" : "",
      );

    return (
      <>
        <main className="flex flex-col items-center justify-center !space-y-0 bg-foreground">
          {/* Header */}
          <div
            className={cn(
              "!p-2 w-screen bg-background justify-between text-foreground flex flex-row items-center outline-2 outline-offset-2 outline-background relative",
            )}
          >
            {/* Logo */}
            <div className="flex-shrink-0">
              <AnimatedLogo onClick={handleLogoClick} />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex md:flex-row md:space-x-3 ml-2">
              {navLinks.map((link) => (
                <Link key={link.to} to={link.to} className={navLinkClasses(link.to)}>
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Desktop Right Side */}
            <div className="hidden md:flex items-center gap-2.5 mr-10 flex-shrink-0">
              <Link to="/oneshot">
                <Button variant="outline" size="sm">
                  {t("navigation.create", "Create")}
                </Button>
              </Link>
              <RainbowConnectButton />
              <UserSettingsMenu />
            </div>

            {/* Mobile Right Side */}
            <div className="flex md:hidden items-center gap-2 flex-shrink-0">
              <Link to="/oneshot">
                <Button variant="outline" size="sm" className="text-xs px-2">
                  {t("navigation.create", "Create")}
                </Button>
              </Link>
              <RainbowConnectButton />
              <UserSettingsMenu />
              <button
                onClick={handleMobileMenuToggle}
                className="p-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden w-screen bg-background border-b-2 border-border shadow-lg z-50">
              <div className="flex flex-col space-y-3 p-4">
                {/* Mobile Navigation Links */}
                <nav className="flex flex-col space-y-2">
                  {navLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={handleNavClick}
                      className={cn(
                        "cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground text-center flex items-center justify-center uppercase tracking-widest text-lg hover:bg-accent hover:text-accent-foreground rounded-md py-3",
                        location.pathname === link.to ? "active bg-accent text-accent-foreground" : "",
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          )}

          {/* Main Content */}
          <div className="min-h-screen w-screen bg-background border-t-4 border-border relative z-0">
            <Outlet />
          </div>
        </main>

        {/* Overlay for mobile menu */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-25 z-40 md:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </>
    );
  },
});
