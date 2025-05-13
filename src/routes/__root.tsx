import { ConnectMenu } from "@/ConnectMenu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Link, Outlet, createRootRoute } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <>
      <header className="p-2 flex items-center justify-between w-full gap-5">
        <Link to="/coinpaper">
          <img
            src="/coinchan-logo.png"
            alt="Coinchan"
            className="logo h-10 w-10"
          />
        </Link>
        <nav className="flex items-center justify-center space-x-4">
          <Link
            to="/"
            className="[&.active]:font-bold uppercase hover:text-blue-500 transition-colors"
          >
            📈 Trade
          </Link>
          <span className="">/</span>
          <Link
            to="/explore"
            className="[&.active]:font-bold uppercase hover:text-blue-500 transition-colors"
          >
            🗺️ Explore
          </Link>
          <span className="">/</span>
          <Link
            to="/create"
            className="[&.active]:font-bold uppercase hover:text-blue-500 transition-colors"
          >
            ✨ Create
          </Link>
        </nav>
        <ConnectMenu />
      </header>
      {/* <hr /> */}
      <Outlet />
      <div className="fixed bottom-4 left-4 z-50 animate-fadeIn">
        <ThemeToggle />
      </div>
    </>
  ),
});
