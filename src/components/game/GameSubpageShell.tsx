import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { Show } from "solid-js";
import type { CategoryData } from "~/lib/categories";
import { getGameIdentity } from "~/lib/game-storefront";
import styles from "./GameSubpageShell.module.scss";

type GameSubpageShellProps = {
  category: CategoryData;
  active: "releases" | "sets" | "products";
  title: string;
  description?: string;
  children: JSX.Element;
};

export default function GameSubpageShell(props: GameSubpageShellProps) {
  const identity = () => getGameIdentity(props.category.slug);
  const root = () => `/categories/${props.category.slug}`;

  return (
    <main
      class={styles.page}
      style={`--game-accent:${identity().accent};--game-accent-strong:${identity().accentStrong};--game-ink:${identity().accentInk}`}
    >
      <div class={styles.wide}>
        <nav class={styles.breadcrumb} aria-label="Breadcrumb">
          <A href="/">Home</A>
          <span aria-hidden="true">/</span>
          <A href="/categories">Games</A>
          <span aria-hidden="true">/</span>
          <A href={root()}>{props.category.name}</A>
        </nav>

        <header class={styles.head}>
          <span class={styles.code} aria-hidden="true">{identity().code}</span>
          <h1>{props.title}</h1>
          <Show when={props.description}>
            <p>{props.description}</p>
          </Show>
        </header>

        <nav class={styles.tabs} aria-label={`${props.category.name} pages`}>
          <A href={root()} end>Overview</A>
          <A href={`${root()}/releases`} classList={{ [styles.active]: props.active === "releases" }}>Releases</A>
          <A href={`${root()}/sets`} classList={{ [styles.active]: props.active === "sets" }}>Sets</A>
          <A href={`${root()}/products`} classList={{ [styles.active]: props.active === "products" }}>Shop</A>
        </nav>

        <div class={styles.content}>{props.children}</div>
      </div>
    </main>
  );
}
