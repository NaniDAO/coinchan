import { Globe, Send, X } from "lucide-react";

export type TokenUriMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  attributes?:
    | Record<string, string>
    | Array<{ trait_type?: string; value?: string }>;
};

function ensureProtocol(u: string): string {
  const x = (u || "").trim();
  if (!x) return "";
  if (/^https?:\/\//i.test(x)) return x;
  return `https://${x}`;
}

/** Turn "@handle" or raw "handle" or full twitter/x url into a nice x.com link */
function toXLink(h: string): string {
  const x = (h || "").trim();
  if (!x) return "";
  // if full URL, normalize domain to x.com
  const urlMatch = x.match(/^https?:\/\/(www\.)?(x|twitter)\.com\/([^/?#]+)/i);
  const handle = urlMatch ? urlMatch[3] : x.replace(/^@/, "");
  return `https://x.com/${handle}`;
}

/** Extract attributes as a simple string map from either object or array shape */
function extractAttributesMap(
  meta: TokenUriMetadata | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!meta?.attributes) return result;

  if (Array.isArray(meta.attributes)) {
    for (const item of meta.attributes) {
      const k = (item?.trait_type || "").trim().toLowerCase();
      const v = (item?.value || "").toString().trim();
      if (k && v) result[k] = v;
    }
  } else {
    for (const [k, v] of Object.entries(meta.attributes)) {
      if (typeof v === "string" && v.trim()) result[k.toLowerCase()] = v.trim();
    }
  }
  return result;
}

export function buildProjectLinksFromMetadata(
  meta: TokenUriMetadata | null | undefined,
): Array<{
  key: string;
  label: string;
  href: string;
  title: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> {
  const attrs = extractAttributesMap(meta);

  const website = ensureProtocol(attrs["website"]);
  const twitter = attrs["twitter"] ? toXLink(attrs["twitter"]) : "";
  const discord = ensureProtocol(attrs["discord_invite"] || attrs["discord"]);
  const telegram = ensureProtocol(
    attrs["telegram_invite"] || attrs["telegram"],
  );

  const out: Array<{
    key: string;
    label: string;
    href: string;
    title: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }> = [];

  if (website)
    out.push({
      key: "website",
      label: "Website",
      href: website,
      title: website,
      icon: Globe,
    });
  if (twitter)
    out.push({
      key: "twitter",
      label: "Twitter",
      href: twitter,
      title: twitter,
      icon: X,
    });
  if (discord)
    out.push({
      key: "discord",
      label: "Discord",
      href: discord,
      title: discord,
      icon: Send,
    });
  if (telegram)
    out.push({
      key: "telegram",
      label: "Telegram",
      href: telegram,
      title: telegram,
      icon: Send,
    });

  return out;
}

export function buildProjectLinks(
  state: any,
): Array<{ label: string; href: string; title: string }> {
  const out: Array<{ label: string; href: string; title: string }> = [];

  const website = ensureProtocol(state.website || "");
  const twitter = (state.twitter || "").trim();
  const discord = ensureProtocol(state.discordInvite || "");
  const telegram = ensureProtocol(state.telegramInvite || "");

  if (website) {
    out.push({ label: "Website", href: website, title: website });
  }
  if (twitter) {
    const href = toXLink(twitter);
    out.push({ label: "Twitter", href, title: href });
  }
  if (discord) {
    out.push({ label: "Discord", href: discord, title: discord });
  }
  if (telegram) {
    out.push({ label: "Telegram", href: telegram, title: telegram });
  }

  return out;
}
