import { For, type JSX } from "solid-js";
import { createStorefrontSocials } from "~/lib/storefront-socials";
import type { SocialNetwork } from "~/lib/social-links";

const NETWORKS: Array<{ network: SocialNetwork; label: string }> = [
  { network: "tiktok", label: "TikTok" },
  { network: "youtube", label: "YouTube" },
  { network: "discord", label: "Discord" },
  { network: "instagram", label: "Instagram" },
];

function SocialIcon(props: { network: SocialNetwork }) {
  const paths: Record<SocialNetwork, JSX.Element> = {
    tiktok: <path d="M15.5 3c.4 2.3 1.8 3.8 4.2 4.2v3.1a10 10 0 0 1-4.2-1.1v6.2a6.4 6.4 0 1 1-5.5-6.3v3.2a3.2 3.2 0 1 0 2.3 3.1V3h3.2Z" />,
    youtube: <path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.8 4.7 12 4.7 12 4.7s-5.8 0-7.6.5a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.8.5 7.6.5 7.6.5s5.8 0 7.6-.5a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8ZM10 15.2V8.8l5.5 3.2-5.5 3.2Z" />,
    discord: <path d="M19.7 5.3A16 16 0 0 0 15.8 4l-.5 1.1a14.7 14.7 0 0 0-6.6 0L8.2 4a16 16 0 0 0-3.9 1.3C1.8 9 1.1 12.6 1.4 16.2A15.8 15.8 0 0 0 6.2 19l1.2-1.6a10 10 0 0 1-1.8-.9l.4-.3a11.5 11.5 0 0 0 12 0l.5.3a12 12 0 0 1-1.9.9l1.2 1.6a15.8 15.8 0 0 0 4.8-2.8c.4-4.2-.7-7.8-2.9-10.9ZM8.6 14.5c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Zm6.8 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4Z" />,
    instagram: <path d="M7.4 2h9.2A5.4 5.4 0 0 1 22 7.4v9.2a5.4 5.4 0 0 1-5.4 5.4H7.4A5.4 5.4 0 0 1 2 16.6V7.4A5.4 5.4 0 0 1 7.4 2Zm-.2 2A3.2 3.2 0 0 0 4 7.2v9.6A3.2 3.2 0 0 0 7.2 20h9.6a3.2 3.2 0 0 0 3.2-3.2V7.2A3.2 3.2 0 0 0 16.8 4H7.2Zm10.3 1.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />,
  };

  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[props.network]}</svg>;
}

export default function SocialLinks(props: { class?: string; ariaLabel?: string }) {
  const socials = createStorefrontSocials();
  return (
    <nav class={props.class} aria-label={props.ariaLabel ?? "Social media"}>
      <For each={NETWORKS.filter(({ network }) => Boolean(socials()[network]))}>
        {item => (
          <a
            href={socials()[item.network]}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={item.label}
          >
            <SocialIcon network={item.network} />
          </a>
        )}
      </For>
    </nav>
  );
}
