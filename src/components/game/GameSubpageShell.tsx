import type { JSX } from "solid-js";
import GameHeader from "~/components/game/GameHeader";
import type { CategoryData } from "~/lib/categories";
import styles from "./GameSubpageShell.module.scss";

type GameSubpageShellProps = {
  category: CategoryData;
  active: "releases" | "sets" | "products";
  /** Used for the document title by callers; the header shows the game. */
  title?: string;
  description?: string;
  artwork?: string;
  children: JSX.Element;
};

export default function GameSubpageShell(props: GameSubpageShellProps) {
  return (
    <main class={styles.page}>
      <div class={styles.wide}>
        <GameHeader slug={props.category.slug} name={props.category.name} active={props.active} />
        <div class={styles.content}>{props.children}</div>
      </div>
    </main>
  );
}
