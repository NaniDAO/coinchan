import { ConnectMenu } from "@/ConnectMenu";
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

export const Route = createRootRoute({
  component: () => (
    <>
      <header className="p-2 flex items-center justify-between w-full gap-5">
        <img
          src="/coinchan-logo.png"
          alt="Coinchan"
          className="logo h-10 w-10"
        />
        <nav className="flex items-center justify-center space-x-2">
          <Link to="/" className="[&.active]:font-bold uppercase">
            Swap
          </Link>{" "}
          <Link to="/about" className="[&.active]:font-bold uppercase">
            Coins
          </Link>
        </nav>
        <ConnectMenu />
      </header>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
