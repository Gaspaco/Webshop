import { A } from "@solidjs/router";
import styles from "./GameHeader.module.scss";

export type GameSection = "overview" | "products" | "sets" | "releases";

// The one header every game page shares: back to all games, the game's
// name, and its four pages as tabs, all on one line.
export default function GameHeader(props: { slug: string; name: string; active: GameSection }) {
  const root = () => `/categories/${props.slug}`;
  const tabs: Array<{ key: GameSection; label: string; href: () => string }> = [
    { key: "overview", label: "Overview", href: root },
    { key: "products", label: "Shop", href: () => `${root()}/products` },
    { key: "sets", label: "Sets", href: () => `${root()}/sets` },
    { key: "releases", label: "Releases", href: () => `${root()}/releases` },
  ];

  return (
    <header class={styles.header} data-game={props.slug}>
      <div class={styles.titleBlock}>
        <A href="/categories" class={styles.back}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          All games
        </A>
        <h1>{props.name}</h1>
      </div>

      <nav class={styles.tabs} aria-label={`${props.name} pages`}>
        {tabs.map(tab => (
          <A
            href={tab.href()}
            end
            class={styles.tab}
            classList={{ [styles.tabActive]: props.active === tab.key }}
            aria-current={props.active === tab.key ? "page" : undefined}
          >
            {tab.label}
          </A>
        ))}
      </nav>
    </header>
  );
}
