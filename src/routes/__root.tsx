import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import UserSettingsMenu from "@/components/UserSettingsMenu";
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
import { AnimatedLogo } from "@/components/AnimatedLogo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isTradeOpen, setIsTradeOpen] = useState(false);

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
        <main className="flex flex-col items-center justify-center !space-y-0 bg-foreground overflow-x-hidden">
          {/* Header */}
          <div
            className={cn(
              "!p-2 w-full max-w-[100vw] bg-background justify-between text-foreground flex flex-row items-center relative",
            )}
          >
            {/* Logo */}
            <div className="flex-shrink-0">
              <AnimatedLogo onClick={handleLogoClick} />
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex md:flex-row items-stretch gap-3">
              <div className="flex-1 min-w-0 relative">
                <DropdownMenu open={isTradeOpen} onOpenChange={setIsTradeOpen}>
                  <DropdownMenuTrigger asChild>
                    <Link
                      to="/swap"
                      className={cn(
                        navLinkClasses("/swap"),
                        "w-full inline-flex",
                      )}
                      onMouseEnter={() => setIsTradeOpen(true)}
                      onMouseLeave={() => setIsTradeOpen(false)}
                    >
                      {t("common.trade")}
                    </Link>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="min-w-[160px]"
                    onMouseEnter={() => setIsTradeOpen(true)}
                    onMouseLeave={() => setIsTradeOpen(false)}
                  >
                    <DropdownMenuItem asChild>
                      <Link to="/swap" className="w-full">
                        Swap
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/limit" className="w-full">
                        Limit
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {[
                { to: "/explore", label: t("common.explore") },
                { to: "/positions", label: t("common.positions") },
                { to: "/coins", label: t("common.coins") },
                { to: "/farm", label: `🌾 ${t("common.farm")}` },
              ].map((link) => (
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
                {isMobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
          {/* Mobile Dropdown Menu */}
          {isMobileMenuOpen && (
            <div className="md:hidden w-screen bg-background border-b-2 border-border shadow-lg z-50">
              <div className="flex flex-col space-y-3 p-4">
                {/* Mobile Navigation Links */}
                <nav className="flex flex-col space-y-2">
                  {[
                    { to: "/swap", label: t("common.trade") },
                    { to: "/explore", label: t("common.explore") },
                    { to: "/positions", label: t("common.positions") },
                    { to: "/coins", label: t("common.coins") },
                    { to: "/farm", label: `🌾 ${t("common.farm")}` },
                  ].map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      onClick={handleNavClick}
                      className={cn(
                        "cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground text-center flex items-center justify-center uppercase tracking-widest text-lg hover:bg-accent hover:text-accent-foreground rounded-md py-3",
                        location.pathname === link.to
                          ? "active bg-accent text-accent-foreground"
                          : "",
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
          <div className="min-h-screen w-full max-w-[100vw] bg-background z-0 overflow-x-hidden">
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
