import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import styles from "./LoadingScreen.module.scss";

const MINIMUM_DISPLAY_MS = 1700;
const MAXIMUM_ASSET_WAIT_MS = 2200;
const EXIT_DURATION_MS = 1100;
const CARD_CHANGE_MS = 720;
const LOADER_SESSION_KEY = "tcg-haven-loader-seen";

const LOADER_CARDS = [
  { src: "/images/cards/umbreon.png", name: "Umbreon VMAX" },
  { src: "/images/cards/charizard.png", name: "Charizard Base Set" },
  { src: "/images/cards/rayquaza.png", name: "Rayquaza VMAX" },
  { src: "/images/cards/venusaur.png", name: "Venusaur Base Set" },
  { src: "/images/cards/blastoise.png", name: "Blastoise Base Set" },
];

export default function LoadingScreen() {
  const [progress, setProgress] = createSignal(0);
  const [activeCard, setActiveCard] = createSignal(0);
  const [leaving, setLeaving] = createSignal(false);
  const [gone, setGone] = createSignal(false);

  onMount(() => {
    try {
      if (sessionStorage.getItem(LOADER_SESSION_KEY) === "true") {
        setGone(true);
        return;
      }

      sessionStorage.setItem(LOADER_SESSION_KEY, "true");
    } catch {
      // Storage can be unavailable in strict privacy modes. The loader still works.
    }

    const startedAt = performance.now();
    const previousOverflow = document.body.style.overflow;
    let currentProgress = 0;
    let assetsReady = false;
    let animationFrame = 0;
    let exitTimer = 0;
    let removeTimer = 0;

    document.body.style.overflow = "hidden";
    setActiveCard(Math.floor(Math.random() * LOADER_CARDS.length));

    const cardRotation = window.setInterval(() => {
      setActiveCard(current => (current + 1) % LOADER_CARDS.length);
    }, CARD_CHANGE_MS);

    const imageReadiness = Array.from(document.images).map(image => {
      if (image.complete) return Promise.resolve();
      return image.decode?.().catch(() => undefined) ?? Promise.resolve();
    });

    const fontReadiness = document.fonts?.ready ?? Promise.resolve();
    Promise.allSettled([fontReadiness, ...imageReadiness]).then(() => {
      assetsReady = true;
    });

    const assetLimit = window.setTimeout(() => {
      assetsReady = true;
    }, MAXIMUM_ASSET_WAIT_MS);

    const finish = () => {
      setProgress(100);
      exitTimer = window.setTimeout(() => setLeaving(true), 260);
      removeTimer = window.setTimeout(() => {
        document.body.style.overflow = previousOverflow;
        setGone(true);
      }, EXIT_DURATION_MS + 320);
    };

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const stagedTarget = Math.min(90, 4 + (elapsed / 1700) * 86);
      currentProgress = Math.max(currentProgress, stagedTarget);

      if (assetsReady && elapsed >= MINIMUM_DISPLAY_MS) {
        currentProgress += Math.max(0.35, (100 - currentProgress) * 0.07);
      }

      if (currentProgress >= 99.5) {
        finish();
        return;
      }

      setProgress(Math.min(99, Math.floor(currentProgress)));
      animationFrame = requestAnimationFrame(tick);
    };

    animationFrame = requestAnimationFrame(tick);

    onCleanup(() => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(assetLimit);
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
      clearInterval(cardRotation);
      document.body.style.overflow = previousOverflow;
    });
  });

  return (
    <Show when={!gone()}>
      <div
        class={styles.overlay}
        classList={{ [styles.leaving]: leaving() }}
        role="status"
        aria-label="Loading TCGHaven"
        aria-hidden={leaving()}
      >
        <div class={`${styles.panel} ${styles.panelLeft}`} aria-hidden="true" />
        <div class={`${styles.panel} ${styles.panelRight}`} aria-hidden="true" />

        <header class={styles.topline}>
          <span class={styles.brand}>
            TCG<span>Haven</span>
          </span>
          <span class={styles.edition}>Private collection / Netherlands</span>
        </header>

        <div class={styles.content}>
          <div class={styles.composition} aria-hidden="true">
            <div class={styles.intro}>
              <span class={styles.index}>Collection / 026</span>
              <p class={styles.statement}>A rare find is almost ready.</p>
              <span class={styles.subline}>Selected with care</span>
            </div>

            <div class={styles.cardStage}>
              <span class={styles.cardNumber}>
                {String(activeCard() + 1).padStart(2, "0")} / 26
              </span>
              <div class={styles.cardShell}>
                <For each={LOADER_CARDS}>
                  {(card, index) => (
                    <>
                      <img
                        class={styles.cardGhost}
                        classList={{ [styles.activeCard]: index() === activeCard() }}
                        src={card.src}
                        alt=""
                      />
                      <div
                        class={styles.cardReveal}
                        classList={{ [styles.activeCard]: index() === activeCard() }}
                        style={{ "clip-path": `inset(${100 - progress()}% 0 0 0)` }}
                      >
                        <img src={card.src} alt="" />
                      </div>
                    </>
                  )}
                </For>
                <span
                  class={styles.revealLine}
                  style={{ top: `${100 - progress()}%` }}
                />
              </div>
              <div class={styles.cardDetails}>
                <span>{LOADER_CARDS[activeCard()].name}</span>
                <span>Curated single</span>
              </div>
            </div>
          </div>

          <div class={styles.readout}>
            <span class={styles.loadingLabel}>Opening the collection</span>
            <span class={styles.count} aria-hidden="true">
              {String(progress()).padStart(2, "0")}
              <small>%</small>
            </span>
          </div>
        </div>

        <div
          class={styles.progress}
          role="progressbar"
          aria-label="Page loading progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={progress()}
        >
          <span style={{ width: `${progress()}%` }} />
        </div>
      </div>
    </Show>
  );
}
