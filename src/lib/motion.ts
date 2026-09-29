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

const MOTION_CONTROL_SELECTOR = [
  "button:not([role='tab'])",
  "a[data-motion-control]",
  "a[class*='Action']",
  "a[class*='action']",
  "a[class*='Cta']",
  "a[class*='cta']",
  "a[class*='Button']",
  "a[class*='button']",
].join(",");

function motionControl(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(MOTION_CONTROL_SELECTOR);
  return control && root.contains(control) ? control : null;
}

/**
 * One restrained interaction language for public-page controls. The movement
 * is intentionally tiny: it should communicate response, not call attention
 * to the animation itself.
 */
function enhanceControls(root: HTMLElement) {
  if (prefersReducedMotion()) return () => {};
  setup();

  const hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const animated = new Set<HTMLElement>();

  const enter = (event: PointerEvent) => {
    if (!hoverCapable) return;
    const control = motionControl(root, event.target);
    if (!control || control.matches(":disabled, [aria-disabled='true']")) return;
    if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return;
    animated.add(control);
    gsap.to(control, {
      y: -1,
      scale: 1.01,
      duration: 0.22,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const leave = (event: PointerEvent) => {
    const control = motionControl(root, event.target);
    if (!control) return;
    if (event.relatedTarget instanceof Node && control.contains(event.relatedTarget)) return;
    gsap.to(control, {
      y: 0,
      scale: 1,
      duration: 0.28,
      ease: "power3.out",
      overwrite: "auto",
      clearProps: "transform",
    });
  };

  const press = (event: PointerEvent) => {
    const control = motionControl(root, event.target);
    if (!control || control.matches(":disabled, [aria-disabled='true']")) return;
    animated.add(control);
    gsap.to(control, {
      y: 0,
      scale: 0.975,
      duration: 0.1,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  const release = (event: PointerEvent) => {
    const control = motionControl(root, event.target);
    if (!control) return;
    gsap.to(control, {
      y: hoverCapable ? -1 : 0,
      scale: hoverCapable ? 1.01 : 1,
      duration: 0.18,
      ease: "power2.out",
      overwrite: "auto",
    });
  };

  root.addEventListener("pointerover", enter);
  root.addEventListener("pointerout", leave);
  root.addEventListener("pointerdown", press);
  root.addEventListener("pointerup", release);
  root.addEventListener("pointercancel", leave);

  return () => {
    root.removeEventListener("pointerover", enter);
    root.removeEventListener("pointerout", leave);
    root.removeEventListener("pointerdown", press);
    root.removeEventListener("pointerup", release);
    root.removeEventListener("pointercancel", leave);
    gsap.killTweensOf([...animated]);
    animated.forEach(control => gsap.set(control, { clearProps: "transform" }));
  };
}

/**
 * Shared public-route entrance and control feedback. Auth and dashboard routes
 * keep their task-specific behavior and do not use this layer. Section reveals
 * stay opt-in at component level so long pages never feel over-animated.
 */
export function animatePublicRoute(root: HTMLElement) {
  if (prefersReducedMotion()) return () => {};
  setup();

  const routeTween = gsap.fromTo(
    root,
    { autoAlpha: 0, y: 10 },
    {
      autoAlpha: 1,
      y: 0,
      duration: 0.46,
      ease: "power3.out",
      clearProps: "opacity,visibility,transform",
    },
  );

  const stopControls = enhanceControls(root);

  return () => {
    routeTween.kill();
    stopControls();
  };
}
