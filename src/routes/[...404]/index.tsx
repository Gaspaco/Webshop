import { Meta, Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";
import styles from "./404.module.scss";

export default function NotFound() {
  return (
    <main class={styles.page}>
      <Title>Page Not Found | My Little TCG Haven</Title>
      <Meta
        name="description"
        content="This page could not be found. Return home or browse the card collection."
      />
      <Meta name="robots" content="noindex, follow" />
      <HttpStatusCode code={404} />

      <section class={styles.content} aria-labelledby="not-found-title">
        <span class={styles.eyebrow}>Lost in the collection</span>

        <div class={styles.errorCode} aria-label="Error 404">
          <span>4</span>
          <figure class={styles.cardSlot}>
            <img src="/images/cards/umbreon.png" alt="" />
          </figure>
          <span>4</span>
        </div>

        <h1 id="not-found-title">This page slipped out of its sleeve.</h1>
        <p>
          The link may be outdated, or the page may have moved somewhere else in
          the collection.
        </p>

        <nav class={styles.actions} aria-label="Not found page navigation">
          <A class={styles.primaryAction} href="/">
            Return home
          </A>
          <A class={styles.secondaryAction} href="/products">
            Browse the shop
          </A>
        </nav>
      </section>

      <span class={styles.reference} aria-hidden="true">
        MLH / 404
      </span>
    </main>
  );
}
