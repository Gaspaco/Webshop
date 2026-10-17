export type SocialNetwork = "instagram" | "tiktok" | "youtube" | "discord";

export type StorefrontSocialLinks = Record<SocialNetwork, string>;

export const EMPTY_SOCIAL_LINKS: StorefrontSocialLinks = {
  instagram: "",
  tiktok: "",
  youtube: "",
  discord: "",
};

const HANDLE_PATTERN = /^[a-zA-Z0-9._-]+$/;

function asUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function cleanHandle(value: string) {
  const handle = value.trim().replace(/^@/, "").replace(/^\/+|\/+$/g, "");
  return HANDLE_PATTERN.test(handle) ? handle : "";
}

export function normalizeSocialUrl(network: SocialNetwork, rawValue: string | null | undefined) {
  const value = rawValue?.trim();
  if (!value) return "";

  if (network === "instagram") {
    const plainHandle = !value.includes("/") && !value.includes(":")
      ? cleanHandle(value)
      : "";
    if (plainHandle) return `https://www.instagram.com/${plainHandle}/`;

    const url = asUrl(value);
    if (!url || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())) {
      return "";
    }
    const handle = cleanHandle(url.pathname.split("/").filter(Boolean)[0] ?? "");
    return handle ? `https://www.instagram.com/${handle}/` : "";
  }

  if (network === "tiktok") {
    const plainHandle = !value.includes("/") && !value.includes(":")
      ? cleanHandle(value)
      : "";
    if (plainHandle) return `https://www.tiktok.com/@${plainHandle}`;

    const url = asUrl(value);
    if (!url || !["tiktok.com", "www.tiktok.com"].includes(url.hostname.toLowerCase())) {
      return "";
    }
    const handle = cleanHandle(url.pathname.split("/").filter(Boolean)[0] ?? "");
    return handle ? `https://www.tiktok.com/@${handle}` : "";
  }

  if (network === "youtube") {
    const plainHandle = !value.includes("/") && !value.includes(":")
      ? cleanHandle(value)
      : "";
    if (plainHandle) return `https://www.youtube.com/@${plainHandle}`;

    const url = asUrl(value);
    if (!url || !["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname.toLowerCase())) {
      return "";
    }
    return url.toString();
  }

  const url = asUrl(value);
  if (!url || !["discord.com", "www.discord.com", "discord.gg"].includes(url.hostname.toLowerCase())) {
    return "";
  }
  return url.toString();
}

export function normalizeStorefrontSocials(content: {
  socialInstagram?: string;
  socialTiktok?: string;
  socialYoutube?: string;
  socialDiscord?: string;
} | null | undefined): StorefrontSocialLinks {
  return {
    instagram: normalizeSocialUrl("instagram", content?.socialInstagram),
    tiktok: normalizeSocialUrl("tiktok", content?.socialTiktok),
    youtube: normalizeSocialUrl("youtube", content?.socialYoutube),
    discord: normalizeSocialUrl("discord", content?.socialDiscord),
  };
}
