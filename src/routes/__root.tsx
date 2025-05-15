import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

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
        <nav className="flex items-center justify-center space-x-4">
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
      </header>
      {/* <hr /> */}
      <Outlet />
    </>
  ),
});
