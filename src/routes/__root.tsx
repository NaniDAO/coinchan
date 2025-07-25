import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import { SwapRibbon } from "@/components/SwapRibbon";
import UserSettingsMenu from "@/components/UserSettingsMenu";
import { ZammLogo } from "@/components/ZammLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Link,
  Outlet,
  createRootRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Menu, X } from "lucide-react";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const handleLogoClick = () => {
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
      { to: "/farm", label: t("common.farm") },
      { to: "/explore", label: t("common.explore") },
    ];

    const navLinkClasses = (path: string) =>
      cn(
        "cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-widest hover:bg-accent hover:text-accent-foreground",
        "md:text-lg text-base px-3 py-2 md:py-0",
        location.pathname === path
          ? "active bg-accent text-accent-foreground"
          : "",
      );

    return (
      <>
        {/* Top ribbon */}
        <div className="bg-foreground text-primary-foreground p-1 w-full text-center font-bold flex justify-center items-center font-display text-sm">
          <SwapRibbon />
        </div>

        <main className="mt-8 flex flex-col items-center justify-center !space-y-0 bg-foreground">
          {/* Header */}
          <div className="!p-2 w-screen bg-background justify-between text-foreground flex flex-row items-center outline-2 outline-offset-2 outline-background relative">
            {/* Mobile Layout */}
            <div className="flex md:hidden w-full items-center">
              {/* Left: Logo */}
              {/* <div className="flex-shrink-0">
                <ZammLogo
                  className="!m-0"
                  size="small"
                  onClick={handleLogoClick}
                />
              </div> */}

              {/* Center: Navigation Links (visible on mobile) */}
              <nav className="flex flex-1 justify-center mx-4">
                <div className="flex space-x-1">
                  {navLinks.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      className={cn(
                        "cursor-pointer border-2 border-transparent transition-all duration-100 font-bold font-body no-underline text-foreground text-center flex items-center justify-center uppercase tracking-wider hover:bg-accent hover:text-accent-foreground rounded-md",
                        "text-xs px-2 py-1.5",
                        location.pathname === link.to
                          ? "active bg-accent text-accent-foreground"
                          : "",
                      )}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </nav>

              {/* Right: Menu Button */}
              <div className="flex-shrink-0">
                <button
                  onClick={handleMobileMenuToggle}
                  className="p-2 hover:bg-accent hover:text-accent-foreground rounded-md transition-colors"
                  aria-label="Toggle menu"
                >
                  {isMobileMenuOpen ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Desktop Layout */}
            <div className="hidden md:flex w-full items-center">
              {/* Logo */}
              <div className="flex-shrink-0">
                <ZammLogo
                  className="!m-0"
                  size="small"
                  onClick={handleLogoClick}
                />
              </div>

              {/* Desktop Navigation */}
              <nav className="flex flex-row space-x-3 ml-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={navLinkClasses(link.to)}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Desktop Right Side */}
              <div className="flex items-center gap-2.5 mr-10 flex-shrink-0 ml-auto">
                <Link to="/oneshot">
                  <Button variant="outline" size="sm">
                    {t("navigation.create", "Create")}
                  </Button>
                </Link>
                <RainbowConnectButton />
                <UserSettingsMenu />
              </div>
            </div>
          </div>

          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden w-screen bg-background border-b-2 border-border shadow-lg z-50">
              <div className="flex flex-col space-y-3 p-4">
                {/* Action Buttons */}
                <div className="flex items-center justify-center gap-3">
                  <Link to="/oneshot" onClick={handleNavClick}>
                    <Button variant="outline" size="sm">
                      {t("navigation.create", "Create")}
                    </Button>
                  </Link>
                  <RainbowConnectButton />
                  <UserSettingsMenu />
                </div>
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
