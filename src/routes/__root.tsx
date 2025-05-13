import { ConnectMenu } from "@/ConnectMenu";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

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
      <TanStackRouterDevtools />
    </>
  ),
});
