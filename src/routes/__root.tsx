import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createRootRoute({
  component: () => (
    <>
      <header className="p-2 flex items-center justify-between w-full gap-5">
        <Link to="/coinpaper">
          <img
            src="/coinchan-logo.png"
            alt="Coinchan"
            className="logo h-10 w-10 dark:invert"
          />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center justify-center space-x-4">
          <Link
            to="/"
            className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
          >
            📈 Trade
          </Link>
          <span className="">/</span>
          <Link
            to="/explore"
            className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
          >
            🗺️ Explore
          </Link>
          <span className="">/</span>
          <Link
            to="/send"
            className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
          >
            🪁 Send
          </Link>
          <span className="">/</span>
          <Link
            to="/create"
            className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
          >
            ✨ Create
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <ConnectMenu />
          <ThemeToggle />
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
                📈 Trade
              </Link>
              <Link
                to="/explore"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                🗺️ Explore
              </Link>
              <Link
                to="/send"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                🪁 Send
              </Link>
              <Link
                to="/create"
                className="[&.active]:font-bold uppercase hover:text-primary transition-colors"
              >
                ✨ Create
              </Link>
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      {/* <hr /> */}
      <Outlet />
    </>
  ),
});
