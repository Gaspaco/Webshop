import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { For } from "solid-js";
import styles from "./index.module.scss";

// Alex's values, written as the abilities on a trading card.
const ABILITIES = [
  {
    name: "Hand graded",
    text: "Every card is checked by hand and photographed as it is. No stock images, no surprises.",
  },
  {
    name: "Fair prices",
    text: "No marketplace mark-ups or hidden fees, set by someone who knows the cards.",
  },
  {
    name: "A real person",
    text: "Message the shop and you're talking to Alex. Same collector, every time.",
  },
];

// How the shop came to be, in order.
const STORY = [
  {
    image: "/images/cards/charizard.png",
    title: "One Charizard",
    text: "A beat-up Charizard, traded for in a schoolyard and never let go of.",
  },
  {
    image: "/images/cards/umbreon.png",
    title: "A shoebox",
    text: "One card became a shoebox full of them, sorted and re-sorted far too often.",
  },
  {
    image: "/images/cards/rayquaza.png",
    title: "A spare room",
    text: "The shoebox became a spare room, and the spare room ran out of shelves.",
  },
  {
    image: "/images/logo-mark.png",
    title: "The Haven",
    text: "A small, honest shop with a real person who cares how your card arrives.",
  },
];

export default function About() {
  return (
    <main class={styles.page}>
      <Title>About | TCGHaven</Title>

      <div class={styles.wide}>
        <section class={styles.hero}>
          <div class={styles.heroCopy}>
            <h1>Hey, I'm Alex.</h1>
            <p>
              My Little TCG Haven is a one-person shop. I run it, I pack it, and I
              grade every card that leaves the door. It's the card store I always
              wished I could shop at, so I built it.
            </p>
            <div class={styles.actions}>
              <A href="/categories" class={styles.primary}>Start browsing</A>
              <A href="/contact" class={styles.secondary}>Say hi</A>
            </div>
          </div>

          {/* Alex, as a trading card. */}
          <div class={styles.cardWrap}>
            <article class={styles.card} aria-label="Alex, shopkeeper of TCGHaven">
              <div class={styles.cardInner}>
                <header class={styles.cardTop}>
                  <strong>Alex</strong>
                  <span>Shopkeeper</span>
                </header>

                <div class={styles.cardArt}>
                  <img src="/images/logo-mark.png" alt="" draggable={false} />
                </div>

                <p class={styles.cardType}>Collector from Rotterdam</p>

                <ul class={styles.abilities}>
                  <For each={ABILITIES}>
                    {ability => (
                      <li>
                        <span class={styles.energy} aria-hidden="true" />
                        <div>
                          <strong>{ability.name}</strong>
                          <p>{ability.text}</p>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>

                <footer class={styles.cardFoot}>
                  <span>Ships from the Netherlands</span>
                  <span>001/001</span>
                </footer>
              </div>
              <span class={styles.foil} aria-hidden="true" />
            </article>
          </div>
        </section>

        <section class={styles.story} aria-labelledby="story-title">
          <h2 id="story-title">How the Haven started</h2>
          <ol class={styles.steps}>
            <For each={STORY}>
              {(step, index) => (
                <li class={styles.step}>
                  <span class={styles.stepArt}>
                    <img src={step.image} alt="" loading="lazy" draggable={false} />
                  </span>
                  <span class={styles.stepNumber}>{index() + 1}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              )}
            </For>
          </ol>
        </section>

        <section class={styles.cta}>
          <div>
            <h2>Got a want-list, or cards to sell?</h2>
            <p>Send it over. Every message is read and answered by Alex.</p>
          </div>
          <A href="/contact" class={styles.primary}>Contact the shop</A>
        </section>
      </div>
    </main>
  );
}
