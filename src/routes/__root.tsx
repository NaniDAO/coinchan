import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoinNani } from "@/components/coinnani";
import { useTranslation } from "react-i18next";
import { TokenCommandMenu } from "@/components/TokenCommandMenu";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createRootRoute({
  component: () => {
    const { t } = useTranslation();
    const { theme } = useTheme();

    return (
      <>
        <header
          className={cn(
            "p-2 flex items-center justify-between w-full gap-5 border-b border-white/10 dark:border-white/10 shadow-md bg-gradient-to-tr",
            theme === "dark"
              ? "from-neutral-900 via-neutral-900 to-neutral-950"
              : "from-yellow-50 via-yellow-100 to-yellow-100",
          )}
        >
          {/* Desktop Navigation */}
          <nav
            className={cn(
              "backdrop-blur-lg px-2 rounded-lg hidden md:flex w-full items-center justify-center space-x-4",
              theme === "dark" ? "bg-black/20" : "bg-white/10",
            )}
          >
            <Link
              to="/"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors flex flex-row w-full space-x-1 items-center justify-center"
            >
              <span>📈</span> <span>{t("common.swap")}</span>
            </Link>
            <span className="">/</span>
            <Link
              to="/explore"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors flex flex-row w-full space-x-1 items-center justify-center"
            >
              <span>🗺️</span> <span>{t("common.explore")}</span>
            </Link>
            <span className="">/</span>
            <Link
              to="/orders"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors flex flex-row w-full space-x-1 items-center justify-center"
            >
              <span>📋</span> <span>{t("common.orders")}</span>
            </Link>
            <span className="">/</span>
            <Link
              to="/send"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors flex flex-row w-full space-x-1 items-center justify-center"
            >
              <span>🪁</span> <span>{t("common.send")}</span>
            </Link>
            <span className="">/</span>
            <Link
              to="/create"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors flex flex-row w-full space-x-1 items-center justify-center"
            >
              <span>✨</span> <span>{t("common.create")}</span>
            </Link>
          </nav>
          <TokenCommandMenu />
          <div className="flex items-center gap-2">
            <ConnectMenu />
            <ThemeToggle />
            <LanguageSwitcher />
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
                  to="/create"
                  className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
                >
                  ✨ {t("common.create")}
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </header>
        {/* <hr /> */}
        <CoinNani className="fixed bottom-4 right-4 z-10" />
        <Outlet />
      </>
    );
  },
});
