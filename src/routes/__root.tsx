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
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleLogoClick = () => {
      navigate({ to: "/" });
    };

    return (
      <>
        <div className="bg-background border-b-2 border-border mx-auto my-5 relative md:mx-5">
          <div className="bg-foreground text-primary-foreground p-1 w-full text-center font-bold border-b-[3px] border-border flex justify-center items-center font-display text-sm">
            <div className="text-primary-foreground text-center">
              ═══════════ ZAMM DeFi v1.0 ═══════════
            </div>
          </div>

          <div className="bg-background flex flex-row items-center justify-between px-2">
            {/* App Header */}
            <div className="app-logo">
              <ZammLogo size="small" onClick={handleLogoClick} />
            </div>
            <div className="shrink-0 flex items-center gap-2.5 mr-10">
              <ConnectMenu />
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
          </div>

          <Outlet />

          {/* Terminal Navigation Bar */}
          <div className="border-t-2 border-b-2 border-border py-[10px] my-[20px] flex justify-around gap-0">
            <Link
              to="/swap"
              className={cn(
                "cursor-pointer px-[10px] py-[5px] border-2 border-transparent transition-all duration-100 font-normal font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-[0.5px] text-xs hover:bg-accent",
                location.pathname === "/swap" ? "active" : "",
              )}
            >
              {t("common.swap")}
            </Link>
            <Link
              to="/explore"
              className={cn(
                "cursor-pointer px-[10px] py-[5px] border-2 border-transparent transition-all duration-100 font-normal font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-[0.5px] text-xs hover:bg-accent",
                location.pathname === "/explore" ? "active" : "",
              )}
            >
              {t("common.coins")}
            </Link>
            <Link
              to="/about"
              className={cn(
                "cursor-pointer px-[10px] py-[5px] border-2 border-transparent transition-all duration-100 font-normal font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-[0.5px] text-xs hover:bg-accent",
                location.pathname === "/about" ? "active" : "",
              )}
            >
              {t("common.about")}
            </Link>
          </div>
        </div>
      </>
    );
  },
});
