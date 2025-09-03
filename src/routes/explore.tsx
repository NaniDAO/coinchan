import { cn } from "@/lib/utils";
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";

export const Route = createFileRoute("/explore")({
  component: ExploreLayout,
});

function ExploreLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen w-screen bg-background text-foreground">
      {/* Top tabs nav */}
      <nav
        aria-label="Explore navigation"
        className="sticky top-0 z-30 border-y-2 border-border bg-card text-card-foreground"
      >
        <div className="mx-auto max-w-7xl px-3 sm:px-4">
          <ul
            role="tablist"
            className="no-scrollbar flex items-stretch justify-center gap-2 sm:gap-3 overflow-x-auto py-2"
          >
            {tabs.map((t) => {
              const isActive = location.pathname === t.to;
              return (
                <li key={t.to} className="flex-1 min-w-[9rem] sm:flex-none">
                  <NavLink to={t.to} isActive={isActive}>
                    {t.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Routed content */}
      <div className="p-2 sm:p-3 mx-auto max-w-[95vw] overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

const tabs = [
  { to: "/explore/tokens", label: "Tokens" },
  { to: "/explore/pools", label: "Pools" },
  { to: "/explore/bonded-coins", label: "Bonded Coins" },
  { to: "/explore/orders", label: "Orders" },
];

function NavLink({
  to,
  children,
  isActive,
}: {
  to: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      preload="intent"
      role="tab"
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex w-full select-none items-center justify-center",
        "h-9 px-3 sm:px-4 text-[11px] sm:text-xs uppercase tracking-wide font-medium",
        "border-2 border-transparent transition",
        // semantic colors
        "text-foreground",
        "hover:bg-accent hover:text-accent-foreground hover:border-border",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // active state purely via tokens
        isActive && "bg-accent text-accent-foreground border-border",
      )}
    >
      {children}
    </Link>
  );
}
