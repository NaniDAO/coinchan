import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ZammLogo } from "@/components/ZammLogo";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
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
      <h2 className="text-center mb-5 !font-display">{t("about.title")}</h2>

      <div className="max-w-[600px] mx-auto">
        <div className="text-center my-5">
          <ZammLogo size="large" onClick={handleLogoClick} />
        </div>

        <p className="my-5 font-display">
          {t("about.description")}
        </p>

        <div className="ascii-divider">════════════════════════════════════</div>

        <h3 className="my-5 font-display">{t("about.features_title")}</h3>
        <ul className="list-none p-0">
          <li>▸ {t("about.fair_launch")}</li>
          <li>▸ {t("about.community_governance")}</li>
          <li>▸ {t("about.hyperoptimized")}</li>
        </ul>

        <div className="ascii-divider">════════════════════════════════════</div>

        <p className="text-center my-7">
          <button
            className="button m-1 font-display transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-[6px_6px_0_var(--border)] hover:bg-primary hover:text-primary-foreground hover:-translate-x-[2px] hover:-translate-y-[2px] active:scale-95 active:translate-x-0 active:translate-y-0 active:shadow-none"
            onClick={() => {
              const newWindow = window.open("https://docs.zamm.eth.limo", "_blank");
              if (newWindow) newWindow.opener = null;
            }}
          >
            {t("about.docs")}
          </button>
          <button
            className="button m-1 font-display transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-[6px_6px_0_var(--border)] hover:bg-primary hover:text-primary-foreground hover:-translate-x-[2px] hover:-translate-y-[2px] active:scale-95 active:translate-x-0 active:translate-y-0 active:shadow-none"
            onClick={() => {
              const newWindow = window.open("https://wp.zamm.eth.limo", "_blank");
              if (newWindow) newWindow.opener = null;
            }}
          >
            {t("about.whitepaper")}
          </button>
          <button
            className="button m-1 font-display transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-[6px_6px_0_var(--border)] hover:bg-primary hover:text-primary-foreground hover:-translate-x-[2px] hover:-translate-y-[2px] active:scale-95 active:translate-x-0 active:translate-y-0 active:shadow-none"
            onClick={() => {
              const newWindow = window.open("https://github.com/zammdefi/ZAMM", "_blank");
              if (newWindow) newWindow.opener = null;
            }}
          >
            {t("about.github")}
          </button>
          <button
            className="button m-1 font-display transition-all duration-300 ease-in-out hover:scale-110 hover:shadow-[6px_6px_0_var(--border)] hover:bg-primary hover:text-primary-foreground hover:-translate-x-[2px] hover:-translate-y-[2px] active:scale-95 active:translate-x-0 active:translate-y-0 active:shadow-none"
            onClick={() => {
              const newWindow = window.open("https://zamm.discourse.group/", "_blank");
              if (newWindow) newWindow.opener = null;
            }}
          >
            {t("about.discourse")}
          </button>
        </p>
      </div>
    </div>
  );
}
