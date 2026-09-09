import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./about.module.scss";

const VALUES = [
  {
    title: "Honest grading",
    text: "Every card is graded by hand with real photos and real conditions. No stock images, no surprises at your door.",
  },
  {
    title: "Fair prices",
    text: "No marketplace mark-ups or hidden fees. Prices are set by one person who actually knows the cards.",
  },
  {
    title: "Shipped from NL",
    text: "Packed with care and posted quickly from the Netherlands, with tracking across the EU.",
  },
  {
    title: "A real person",
    text: "When you message the shop, you're talking to Alex, not a call centre. Same collector, every time.",
  },
];

export default function About() {
  return (
    <main class={styles.page}>
      <Title>About | TCGHaven</Title>

      <div class={styles.wide}>
        <header class={styles.hero}>
          <span class={styles.eyebrow}>The person behind it</span>
          <h1 class={styles.heading}>Hey, I'm Alex.</h1>
          <p class={styles.lead}>
            My Little TCG Haven is a one-person shop. I run it, I pack it, and I
            grade every card that leaves the door. It's the card store I always
            wished I could shop at, so I built it.
          </p>
        </header>

        <section class={styles.storyGrid}>
          <div class={styles.media}>
            <img
              src="/images/cards/charizard.png"
              alt="First-edition Base Set Charizard holographic card"
              draggable={false}
            />
          </div>

          <div class={styles.story}>
            <h2 class={styles.storyHeading}>How the Haven started</h2>
            <p>
              It started with a single card, a beat-up Charizard I traded for in
              a schoolyard and never let go of. One card became a shoebox, the
              shoebox became a spare room, and the spare room ran out of shelves.
            </p>
            <p>
              Somewhere along the way I realised the sites I was buying from felt
              cold: cluttered listings, mystery conditions, and no one behind the
              counter. I wanted the opposite: a small, honest shop with a real
              person who cares whether your card arrives exactly as described.
            </p>
            <p>
              So that's what the Haven is. I hand-check and grade everything,
              keep stock counts honest, and treat every order like it's going to
              a friend. Because usually, it is.
            </p>
          </div>
        </section>

        <section class={styles.values}>
          <h2 class={styles.valuesHeading}>How I run it</h2>
          <dl class={styles.valueList}>
            <For each={VALUES}>
              {value => (
                <div class={styles.value}>
                  <dt>{value.title}</dt>
                  <dd>{value.text}</dd>
                </div>
              )}
            </For>
          </dl>
        </section>

        <section class={styles.cta}>
          <div class={styles.ctaText}>
            <h2 class={styles.ctaHeading}>Come say hi</h2>
            <p>
              Have a question, a want-list, or cards you're looking to sell?
              I'd love to hear from you.
            </p>
          </div>
          <div class={styles.ctaActions}>
            <A href="/categories" class={styles.ctaPrimary}>
              Start browsing
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </A>
            <A href="/contact" class={styles.ctaSecondary}>Contact the shop</A>
          </div>
        </section>
      </div>
    </main>
  );
}
