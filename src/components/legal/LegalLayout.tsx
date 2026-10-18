import { A } from "@solidjs/router";
import { createEffect, createSignal, For, on, onCleanup, onMount, type JSX } from "solid-js";
import styles from "~/styles/legal.module.scss";

type LegalLayoutProps = {
  title: string;
  updated: string;
  intro: string;
  sections: Array<{ id: string; title: string }>;
  summary: Array<{ title: string; text: string }>;
  contact: { title: string; text: string; href: string; label: string };
  children: JSX.Element;
};

// Shared shell for the privacy policy and the terms: the short version
// first, then the full text with contents that follow the reader.
export default function LegalLayout(props: LegalLayoutProps) {
  const [active, setActive] = createSignal(props.sections[0]?.id ?? "");
  const [minutes, setMinutes] = createSignal<number | null>(null);
  let contentRef: HTMLDivElement | undefined;
  let progressRef: HTMLSpanElement | undefined;
  let tocRef: HTMLElement | undefined;

  // On small screens the contents are a sideways row: keep the current
  // section's pill in view as the reader moves down the page.
  createEffect(on(active, id => {
    if (!tocRef || getComputedStyle(tocRef).flexDirection !== "row") return;
    const link = tocRef.querySelector<HTMLElement>(`a[href="#${id}"]`);
    if (!link) return;
    tocRef.scrollTo({
      left: link.offsetLeft - tocRef.clientWidth / 2 + link.clientWidth / 2,
      behavior: "smooth",
    });
  }, { defer: true }));

  onMount(() => {
    if (!contentRef) return;

    const words = (contentRef.textContent ?? "").trim().split(/\s+/).length;
    setMinutes(Math.max(1, Math.round(words / 220)));

    // The section whose heading most recently passed the top third.
    const headings = props.sections
      .map(section => document.getElementById(section.id))
      .filter((element): element is HTMLElement => Boolean(element));
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(entry => entry.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "0px 0px -66% 0px" },
    );
    headings.forEach(heading => observer.observe(heading));

    let frame = 0;
    const updateProgress = () => {
      frame = 0;
      if (!contentRef || !progressRef) return;
      const box = contentRef.getBoundingClientRect();
      const travelled = Math.min(1, Math.max(0, (window.innerHeight * 0.4 - box.top) / box.height));
      progressRef.style.transform = `scaleX(${travelled})`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateProgress);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    updateProgress();

    onCleanup(() => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    });
  });

  return (
    <main class={styles.page}>
      <div class={styles.wide}>
        <header class={styles.header}>
          <h1>{props.title}</h1>
          <p>{props.intro}</p>
          <div class={styles.meta}>
            <span class={styles.updated}>Last updated {props.updated}</span>
            {minutes() && <span>{minutes()} min read</span>}
          </div>
        </header>

        <section class={styles.short} aria-labelledby="short-version">
          <h2 id="short-version">The short version</h2>
          <ul>
            <For each={props.summary}>
              {point => (
                <li>
                  <span class={styles.tick} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                  </span>
                  <strong>{point.title}</strong>
                  <p>{point.text}</p>
                </li>
              )}
            </For>
          </ul>
        </section>

        <div class={styles.layout}>
          <nav class={styles.toc} ref={tocRef} aria-label={`${props.title} sections`}>
            <span class={styles.tocLabel}>Contents</span>
            <span class={styles.progress} aria-hidden="true"><span ref={progressRef} /></span>
            <For each={props.sections}>
              {(section, index) => (
                <a
                  href={`#${section.id}`}
                  class={styles.tocLink}
                  classList={{ [styles.tocLinkActive]: active() === section.id }}
                  aria-current={active() === section.id ? "location" : undefined}
                >
                  <span>{String(index() + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              )}
            </For>
          </nav>

          <div class={styles.content} ref={contentRef}>
            {props.children}
          </div>
        </div>

        <section class={styles.closing}>
          <div>
            <h2>{props.contact.title}</h2>
            <p>{props.contact.text}</p>
          </div>
          <div class={styles.closingActions}>
            <A href={props.contact.href} class={styles.closingPrimary}>{props.contact.label}</A>
            <A href="/contact" class={styles.closingSecondary}>Contact the shop</A>
          </div>
        </section>
      </div>
    </main>
  );
}
