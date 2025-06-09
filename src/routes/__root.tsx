import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CoinNani } from "@/components/coinnani";
import { useTranslation } from "react-i18next";

export const Route = createRootRoute({
  component: () => {
    const { t } = useTranslation();
    return (
      <>
        <header className="p-2 flex items-center justify-between w-full gap-5">
          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center justify-center space-x-4">
            <Link
              to="/"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
            >
              📈 {t("common.swap")}
            </Link>
            <span className="">/</span>
            <Link
              to="/explore"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
            >
              🗺️ {t("common.explore")}
            </Link>
            <span className="">/</span>
            <Link
              to="/orders"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
            >
              📋 {t("common.orders")}
            </Link>
            <span className="">/</span>
            <Link
              to="/send"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
            >
              🪁 {t("common.send")}
            </Link>
            <span className="">/</span>
            <Link
              to="/launch"
              className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
            >
              🚀 {t("common.launch")}
            </Link>
          </nav>

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
                  to="/launch"
                  className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
                >
                  🚀 {t("common.launch")}
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
