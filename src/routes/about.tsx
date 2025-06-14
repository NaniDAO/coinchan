import { createFileRoute } from "@tanstack/react-router";
import { ZammLogo } from "@/components/ZammLogo";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

function RouteComponent() {
  const handleLogoClick = () => {
    // Logo animation handled by ZammLogo component
  };

  return (
    <div
      className="py-5"
      style={{
        fontFamily: "var(--font-display)",
      }}
    >
      <h2 className="text-center mb-5 !font-display">About ZAMM</h2>

      <div className="max-w-[600px] mx-auto">
        <div className="text-center my-5">
          <ZammLogo size="large" onClick={handleLogoClick} />
        </div>

        <p className="my-5 font-display">
          ZAMM is a decentralized automated market maker (AMM) protocol built
          for the modern DeFi ecosystem. Inspired by the simplicity and elegance
          of early computing interfaces, ZAMM brings fair launches and minimal
          fees to everyone.
        </p>

        <div className="ascii-divider">
          ════════════════════════════════════
        </div>

        <h3 className="my-5 font-display">FEATURES:</h3>
        <ul className="list-none p-0">
          <li>▸ Fair launch sandbox</li>
          <li>▸ Community governance</li>
          <li>▸ Hyperoptimized for L1</li>
        </ul>

        <div className="ascii-divider">
          ════════════════════════════════════
        </div>

        <p className="text-center my-7">
          <button
            className="button m-1 font-display"
            onClick={() => {
              const newWindow = window.open(
                "https://docs.zamm.eth.limo",
                "_blank",
              );
              if (newWindow) newWindow.opener = null;
            }}
          >
            DOCS
          </button>
          <button
            className="button m-1 font-display"
            onClick={() => {
              const newWindow = window.open(
                "https://wp.zamm.eth.limo",
                "_blank",
              );
              if (newWindow) newWindow.opener = null;
            }}
          >
            WHITEPAPER
          </button>
          <button
            className="button m-1 font-display"
            onClick={() => {
              const newWindow = window.open(
                "https://github.com/zamm-protocol",
                "_blank",
              );
              if (newWindow) newWindow.opener = null;
            }}
          >
            GITHUB
          </button>
          <button
            className="button m-1 font-display"
            onClick={() => {
              const newWindow = window.open(
                "https://discourse.zamm.eth.limo",
                "_blank",
              );
              if (newWindow) newWindow.opener = null;
            }}
          >
            DISCOURSE
          </button>
        </p>
      </div>
    </div>
  );
}
