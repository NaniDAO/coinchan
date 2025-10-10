import { RainbowConnectButton } from "@/components/RainbowConnectButton";
import UserSettingsMenu from "@/components/UserSettingsMenu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link, Outlet, createRootRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import {
  Menu,
  X,
  ArrowLeftRight,
  Clock,
  Send as SendIcon,
  Layers,
  PlusCircle,
  Rocket,
  Coins as CoinsIcon,
  Logs,
  TrendingUp,
  Sparkles,
} from "lucide-react";
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
    const [isPoolOpen, setIsPoolOpen] = useState(false);
    const [isExploreOpen, setIsExploreOpen] = useState(false);
    const [isFarmOpen, setIsFarmOpen] = useState(false); // NEW

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
        location.pathname === path ? "active bg-accent text-accent-foreground" : "",
      );

    const itemClasses = "w-full flex items-center gap-2 py-2 px-2 rounded-md";

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
            {/* Make nav flex-1 so children with flex-1 share space evenly; keeps equal gaps */}
            <nav className="hidden md:flex md:flex-row items-stretch gap-3 flex-1 mx-4">
              {/* Trade */}
              <div className="flex-1 min-w-0 relative">
                <DropdownMenu open={isTradeOpen} onOpenChange={setIsTradeOpen}>
                  <DropdownMenuTrigger asChild>
                    <Link
                      to="/swap"
                      className={cn(navLinkClasses("/swap"), "w-full inline-flex")}
                      onMouseEnter={() => setIsTradeOpen(true)}
                      onMouseLeave={() => setIsTradeOpen(false)}
                    >
                      {t("common.trade")}
                    </Link>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="min-w-[200px]"
                    onMouseEnter={() => setIsTradeOpen(true)}
                    onMouseLeave={() => setIsTradeOpen(false)}
                  >
                    <DropdownMenuItem asChild>
                      <Link to="/swap" className={itemClasses}>
                        <ArrowLeftRight className="h-4 w-4" />
                        <span>{t("common.swap")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/limit" className={itemClasses}>
                        <Clock className="h-4 w-4" />
                        <span>{t("common.limit")}</span>
                      </Link>
                    </DropdownMenuItem>
                    {/* NEW: Send */}
                    <DropdownMenuItem asChild>
                      <Link to="/send" className={itemClasses}>
                        <SendIcon className="h-4 w-4" />
                        <span>{t("common.send")}</span>
                      </Link>
                    </DropdownMenuItem>
                    {/* NEW: Predict */}
                    <DropdownMenuItem asChild>
                      <Link to="/predict" className={itemClasses}>
                        <Sparkles className="h-4 w-4" />
                        <span>{t("common.predict", "Predict")}</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Explore (dropdown) */}
              <div className="flex-1 min-w-0 relative">
                <DropdownMenu open={isExploreOpen} onOpenChange={setIsExploreOpen}>
                  <DropdownMenuTrigger asChild>
                    <Link
                      to="/explore/tokens"
                      className={cn(navLinkClasses("/explore"), "w-full inline-flex")}
                      onMouseEnter={() => setIsExploreOpen(true)}
                      onMouseLeave={() => setIsExploreOpen(false)}
                    >
                      {t("common.explore")}
                    </Link>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="min-w-[220px]"
                    onMouseEnter={() => setIsExploreOpen(true)}
                    onMouseLeave={() => setIsExploreOpen(false)}
                  >
                    <DropdownMenuItem asChild>
                      <Link to="/explore/tokens" className={itemClasses}>
                        <CoinsIcon className="h-4 w-4" />
                        <span>{t("common.tokens")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/explore/pools" className={itemClasses}>
                        <Layers className="h-4 w-4" />
                        <span>{t("common.pools")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/explore/orders" className={itemClasses}>
                        <Logs className="h-4 w-4" />
                        <span>{t("common.orders")}</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Pool (dropdown) */}
              <div className="flex-1 min-w-0 relative">
                <DropdownMenu open={isPoolOpen} onOpenChange={setIsPoolOpen}>
                  <DropdownMenuTrigger asChild>
                    <Link
                      to="/positions" // default click goes to /positions
                      className={cn(navLinkClasses("/positions"), "w-full inline-flex")}
                      onMouseEnter={() => setIsPoolOpen(true)}
                      onMouseLeave={() => setIsPoolOpen(false)}
                    >
                      {t("common.pool")}
                    </Link>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="min-w-[200px]"
                    onMouseEnter={() => setIsPoolOpen(true)}
                    onMouseLeave={() => setIsPoolOpen(false)}
                  >
                    <DropdownMenuItem asChild>
                      <Link to="/positions" className={itemClasses}>
                        <Layers className="h-4 w-4" />
                        <span>{t("common.pool")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/positions/create" className={itemClasses}>
                        <PlusCircle className="h-4 w-4" />
                        <span>{t("navigation.create", "Create")}</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Farm (dropdown) - UPDATED */}
              <div className="flex-1 min-w-0 relative">
                <DropdownMenu open={isFarmOpen} onOpenChange={setIsFarmOpen}>
                  <DropdownMenuTrigger asChild>
                    <Link
                      to="/farm" // default click goes to /farm
                      className={cn(navLinkClasses("/farm"), "w-full inline-flex")}
                      onMouseEnter={() => setIsFarmOpen(true)}
                      onMouseLeave={() => setIsFarmOpen(false)}
                    >
                      {t("common.farm")}
                    </Link>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    align="start"
                    sideOffset={8}
                    className="min-w-[200px]"
                    onMouseEnter={() => setIsFarmOpen(true)}
                    onMouseLeave={() => setIsFarmOpen(false)}
                  >
                    <DropdownMenuItem asChild>
                      <Link to="/stake" className={itemClasses}>
                        <TrendingUp className="h-4 w-4" />
                        <span>{t("common.stake", "Stake")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/farm" className={itemClasses}>
                        <Layers className="h-4 w-4" />
                        <span>{t("common.farm")}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/farm/create" className={itemClasses}>
                        <Rocket className="h-4 w-4" />
                        <span>{t("navigation.create", "Create")}</span>
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>

            {/* Desktop Right Side */}
            <div className="hidden md:flex items-center gap-2.5 flex-shrink-0">
              <Link to="/raise">
                <Button variant="outline" size="sm">
                  {t("common.launch", "Launch")}
                </Button>
              </Link>
              <RainbowConnectButton />
              <UserSettingsMenu />
            </div>

            {/* Mobile Right Side */}
            <div className="flex md:hidden items-center gap-2 flex-shrink-0">
              <Link to="/create">
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
                  {[
                    { to: "/swap", label: `${t("common.trade")} — Swap` },
                    { to: "/limit", label: `${t("common.trade")} — Limit` },
                    { to: "/send", label: `${t("common.trade")} — Send` },
                    { to: "/predict", label: `${t("common.trade")} — ${t("common.predict", "Predict")}` },
                    { to: "/explore", label: t("common.explore") },
                    { to: "/explore/launches", label: "Launches" },
                    { to: "/explore/tokens", label: "Tokens" },
                    { to: "/explore/pools", label: "Pools" },
                    { to: "/explore/curve_coins", label: "Curve Coins" },
                    { to: "/positions", label: t("common.positions") },
                    { to: "/coins", label: t("common.coins") },
                    { to: "/stake", label: `📈 ${t("common.stake", "Stake")}` },
                    { to: "/farm", label: `🌾 ${t("common.farm")}` },
                    {
                      to: "/farm/create",
                      label: `🌾 ${t("common.farm")} — ${t("navigation.create", "Create")}`,
                    }, // NEW
                  ].map((link) => (
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
