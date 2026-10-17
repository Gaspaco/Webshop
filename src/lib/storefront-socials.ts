import { createSignal, onMount } from "solid-js";
import {
  EMPTY_SOCIAL_LINKS,
  normalizeStorefrontSocials,
  type StorefrontSocialLinks,
} from "~/lib/social-links";

type StorefrontContentResponse = {
  content: {
    socialInstagram?: string;
    socialTiktok?: string;
    socialYoutube?: string;
    socialDiscord?: string;
  } | null;
};

let socialRequest: Promise<StorefrontSocialLinks> | undefined;

function fetchStorefrontSocials() {
  socialRequest ??= fetch("/api/storefront/content")
    .then(async response => {
      if (!response.ok) return EMPTY_SOCIAL_LINKS;
      const result = (await response.json()) as StorefrontContentResponse;
      return normalizeStorefrontSocials(result.content);
    })
    .catch(() => EMPTY_SOCIAL_LINKS);
  return socialRequest;
}

export function createStorefrontSocials() {
  const [socials, setSocials] = createSignal<StorefrontSocialLinks>(EMPTY_SOCIAL_LINKS);
  onMount(() => void fetchStorefrontSocials().then(setSocials));
  return socials;
}
