/**
 * Motion helpers for the public storefront.
 *
 * Small, frequent motion (button presses, card hovers, reveals, the route
 * fade) is plain CSS so the browser can run it off the main thread. GSAP is
 * kept for the few moments that need sequencing, and is loaded on demand so
 * pages that never use it never download it.
 */

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cards in a grid deal in as they scroll into view, in reading order. Only for
 * real lists of items, so the stagger reads as sequence.
 *
 * The hidden state is applied from JS (`data-reveal`), so if this never runs
 * the content simply ships visible. Styles live in app.scss.
 */
export function revealCards(container: HTMLElement, selector: string) {
  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") return () => {};

  const targets = Array.from(container.querySelectorAll<HTMLElement>(selector));
  if (!targets.length) return () => {};
  targets.forEach(target => target.setAttribute("data-reveal", ""));

  const observer = new IntersectionObserver(
    entries => {
      // Items entering together stagger in the order they were reported,
      // which is document order.
      entries
        .filter(entry => entry.isIntersecting)
        .forEach((entry, index) => {
          const target = entry.target as HTMLElement;
          target.style.transitionDelay = `${index * 70}ms`;
          target.setAttribute("data-reveal", "in");
          observer.unobserve(target);
          target.addEventListener(
            "transitionend",
            () => {
              target.removeAttribute("data-reveal");
              target.style.removeProperty("transition-delay");
            },
            { once: true },
          );
        });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  targets.forEach(target => observer.observe(target));

  return () => {
    observer.disconnect();
    targets.forEach(target => {
      target.removeAttribute("data-reveal");
      target.style.removeProperty("transition-delay");
    });
  };
}

/**
 * A short fade as a public route mounts. Styles live in app.scss.
 */
export function animatePublicRoute(root: HTMLElement) {
  if (prefersReducedMotion()) return () => {};
  root.classList.add("route-enter");
  const done = () => root.classList.remove("route-enter");
  root.addEventListener("animationend", done, { once: true });
  return () => {
    root.removeEventListener("animationend", done);
    done();
  };
}

/**
 * Sends a copy of the product image into the navbar cart, then bumps the
 * cart icon so the added item has somewhere visible to land.
 */
export async function flyToCart(source: Element | null | undefined) {
  if (prefersReducedMotion() || !(source instanceof HTMLImageElement)) return;
  const cart = document.querySelector<HTMLElement>("[data-cart-target]");
  if (!cart) return;

  // Measure before the (possibly first) GSAP load, while the click position
  // is still where the visitor is looking.
  const from = source.getBoundingClientRect();
  const to = cart.getBoundingClientRect();
  if (!from.width || !to.width) return;

  const size = Math.min(from.width, from.height, 120);
  const ghost = source.cloneNode() as HTMLImageElement;
  ghost.removeAttribute("data-motion-art");
  Object.assign(ghost.style, {
    position: "fixed",
    zIndex: "9999",
    left: `${from.left + from.width / 2 - size / 2}px`,
    top: `${from.top + from.height / 2 - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
    padding: "0",
    objectFit: "contain",
    pointerEvents: "none",
    filter: "drop-shadow(0 12px 16px rgba(0,0,0,.45))",
  });
  document.body.appendChild(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  const { gsap } = await import("gsap");

  // Horizontal and vertical travel use different eases, which bends the path
  // into an arc without needing the MotionPath plugin.
  gsap
    .timeline({ onComplete: () => ghost.remove() })
    .to(ghost, { scale: 1.08, duration: 0.14, ease: "power2.out" })
    .to(ghost, { x: dx, duration: 0.7, ease: "power1.inOut" }, ">")
    .to(ghost, { y: dy, duration: 0.7, ease: "back.in(1.4)" }, "<")
    .to(ghost, { scale: 0.12, rotation: 18, duration: 0.7, ease: "power2.in" }, "<")
    .to(ghost, { autoAlpha: 0, duration: 0.12 }, ">-0.1")
    .fromTo(
      cart,
      { scale: 1 },
      { scale: 1.3, duration: 0.14, ease: "power2.out", yoyo: true, repeat: 1, clearProps: "transform" },
      "<",
    );
}
