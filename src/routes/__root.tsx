import { ConnectMenu } from "@/ConnectMenu";
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
import UserSettingsMenu from "@/components/UserSettingsMenu";

export const Route = createRootRoute({
  component: () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const handleLogoClick = () => {
      navigate({ to: "/" });
    };

    const showLogo = location?.pathname !== "/";

    return (
      <>
        <div className="bg-background relative">
          <div className="bg-foreground text-primary-foreground p-1 w-full text-center font-bold flex justify-center items-center font-display text-sm">
            <div className="text-primary-foreground text-center">
              ═══════════ ZAMM DeFi v1.0 ═══════════
            </div>
          </div>

          <main className="mt-0 max-w-screen flex flex-col items-center justify-center !space-y-0 bg-foreground">
            <div className="w-[70vw]">
              <div
                className={cn(
                  "!p-2 bg-background text-foreground flex flex-row items-center outline-2 outline-offset-2 outline-background",
                  showLogo ? "justify-between" : "justify-end",
                )}
              >
                {/* App Header */}
                {showLogo && (
                  <div>
                    <ZammLogo
                      className="!m-0"
                      size="small"
                      onClick={handleLogoClick}
                    />
                  </div>
                )}
                <div className="shrink-0 flex items-center gap-2.5 mr-10">
                  <ConnectMenu />
                  <UserSettingsMenu />
                </div>
              </div>
              <div className="min-h-screen bg-background border-2 border-border relative z-0">
                <Outlet />
              </div>
            </div>
          </main>

          {/* Terminal Navigation Bar */}
          <div className="z-50 border-t-2 border-b-2 border-border fixed bottom-0 left-0 right-0 flex justify-around gap-0 bg-background">
            <Link
              to="/swap"
              className={cn(
                "h-12 cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-wide text-lg hover:bg-accent hover:text-accent-foreground",
                location.pathname === "/swap" ? "active" : "",
              )}
            >
              {t("common.swap")}
            </Link>
            <Link
              to="/explore"
              className={cn(
                "h-12 cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-wide text-lg hover:bg-accent hover:text-accent-foreground",
                location.pathname === "/explore" ? "active" : "",
              )}
            >
              {t("common.coins")}
            </Link>
            <Link
              to="/about"
              className={cn(
                "h-12 cursor-pointer border-2 border-transparent transition-all duration-100 font-extrabold font-body no-underline text-foreground flex-1 text-center flex items-center justify-center min-w-fit uppercase tracking-wide text-lg hover:bg-accent hover:text-accent-foreground",
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
