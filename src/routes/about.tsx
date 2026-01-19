import { ZammLogo } from "@/components/ZammLogo";
import { SEO } from "@/components/SEO";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";

export const Route = createFileRoute("/about")({
  component: RouteComponent,
});

// FAQ data for SEO - structured for AI crawlers
const faqData = [
  {
    question: "What is ZAMM?",
    answer:
      "ZAMM is the cheapest gas-optimized decentralized exchange (DEX) on Ethereum with a built-in DAICO launchpad. It enables users to trade tokens, place limit orders, and launch their own tokens with investor protections.",
  },
  {
    question: "What makes ZAMM different from other DEXs?",
    answer:
      "ZAMM is hyper-optimized for gas efficiency, making it the cheapest DEX on Ethereum. It also features a built-in DAICO launchpad for fair token launches with investor protections, community governance, and refund mechanisms.",
  },
  {
    question: "Is ZAMM safe to use?",
    answer:
      "Yes. ZAMM smart contracts are audited and open-source. The protocol is non-custodial, meaning you maintain control of your funds at all times. Core contracts are immutable and non-upgradeable.",
  },
  {
    question: "What is a DAICO?",
    answer:
      "A DAICO combines the fundraising benefits of an ICO with the governance protections of a DAO. Investors can vote on fund releases and request refunds if the project fails to deliver on its promises.",
  },
  {
    question: "What tokens can I trade on ZAMM?",
    answer:
      "You can trade ETH and any ERC-20 token on Ethereum mainnet, including custom tokens launched through ZAMM's launchpad.",
  },
  {
    question: "How do I launch a token on ZAMM?",
    answer:
      "Visit the Launch section on zamm.finance, configure your token parameters (name, symbol, supply, pricing curve), and deploy with a single transaction. No coding required.",
  },
  {
    question: "What are ZAMM's fees?",
    answer:
      "ZAMM has minimal trading fees and the lowest gas costs of any Ethereum DEX. Specific fees vary by pool and can be customized by liquidity providers.",
  },
  {
    question: "How do prediction markets work on ZAMM?",
    answer:
      "ZAMM offers two types of prediction markets: Parimutuel (pooled betting with shared payouts) and AMM-based (dynamic pricing with instant liquidity). Users can bet on future outcomes and earn rewards.",
  },
];

function RouteComponent() {
  const { t } = useTranslation();
  const handleLogoClick = () => {
    // Logo animation handled by ZammLogo component
  };

  // JSON-LD for FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqData.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <div
      className="py-5"
      style={{
        fontFamily: "var(--font-display)",
      }}
    >
      <SEO
        title="About ZAMM"
        description="Learn about ZAMM, the cheapest Ethereum DEX with a built-in DAICO launchpad. Fair launches, community governance, and gas-optimized trading."
        url="/about"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <h1 className="text-center mb-5 !font-display text-2xl">{t("about.title")}</h1>

      <div className="max-w-[600px] mx-auto px-4">
        <div className="text-center my-5">
          <ZammLogo size="large" onClick={handleLogoClick} />
        </div>

        <p className="my-5 font-display">{t("about.description")}</p>

        <div className="ascii-divider">════════════════════════════════════</div>

        <h2 className="my-5 font-display text-xl">{t("about.features_title")}</h2>
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

        <div className="ascii-divider">════════════════════════════════════</div>

        {/* FAQ Section for SEO */}
        <section className="my-8" itemScope itemType="https://schema.org/FAQPage">
          <h2 className="text-xl font-display mb-6 text-center">Frequently Asked Questions</h2>

          <div className="space-y-6">
            {faqData.map((faq, index) => (
              <article
                key={index}
                className="border-2 border-border p-4 bg-card"
                itemScope
                itemProp="mainEntity"
                itemType="https://schema.org/Question"
              >
                <h3 className="font-display font-bold mb-2" itemProp="name">
                  {faq.question}
                </h3>
                <div itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <p className="text-muted-foreground text-sm" itemProp="text">
                    {faq.answer}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
