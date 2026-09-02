import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/**
 * GSAP is client-only and the plugin must be registered once. Everything here
 * uses `gsap.from()` deliberately: the element's CSS default is the *visible*
 * state, so if JS never runs (headless render, blocked script, an error before
 * mount) the content still ships visible instead of stuck at opacity 0.
 */
function setup() {
  if (registered) return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type RevealOptions = {
  /** Children to stagger. Omit to animate the element itself. */
  children?: string;
  y?: number;
  duration?: number;
  stagger?: number;
  delay?: number;
  start?: string;
};

/**
 * Lifts an element (or its children, staggered) into place as it scrolls in.
 * Returns a cleanup function.
 */
export function revealOnScroll(
  element: HTMLElement,
  options: RevealOptions = {},
) {
  if (prefersReducedMotion()) return () => {};
  setup();

  const {
    children,
    y = 24,
    duration = 0.85,
    stagger = 0.08,
    delay = 0,
    start = "top 85%",
  } = options;

  const targets = children
    ? Array.from(element.querySelectorAll<HTMLElement>(children))
    : [element];
  if (!targets.length) return () => {};

  // The tween is created inside onEnter rather than passed a scrollTrigger.
  // A `from` tween with a scrollTrigger hides its targets the moment it is
  // built and only reveals them when the trigger fires, so a trigger that
  // never runs would ship the section blank. Building it on enter means the
  // untouched, visible DOM is always the fallback.
  const trigger = ScrollTrigger.create({
    trigger: element,
    start,
    once: true,
    onEnter: () => {
      gsap.from(targets, {
        opacity: 0,
        y,
        duration,
        delay,
        stagger,
        ease: "power3.out",
      });
    },
  });

  return () => trigger.kill();
}

/**
 * A card settling onto the table: rises, straightens, and eases out.
 * Used where a single piece of art is the focal point.
 */
export function dealCard(element: HTMLElement, options: { delay?: number } = {}) {
  if (prefersReducedMotion()) return () => {};
  setup();

  const trigger = ScrollTrigger.create({
    trigger: element,
    start: "top 88%",
    once: true,
    onEnter: () => {
      gsap.from(element, {
        opacity: 0,
        y: 56,
        rotate: -14,
        scale: 0.94,
        duration: 1.1,
        delay: options.delay ?? 0,
        ease: "expo.out",
      });
    },
  });

  return () => trigger.kill();
}
