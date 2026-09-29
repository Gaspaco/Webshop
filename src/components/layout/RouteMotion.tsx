import { onCleanup, onMount, type ParentProps } from "solid-js";
import { animatePublicRoute } from "~/lib/motion";

type RouteMotionProps = ParentProps<{
  enabled?: boolean;
}>;

export default function RouteMotion(props: RouteMotionProps) {
  let root: HTMLDivElement | undefined;

  onMount(() => {
    if (!props.enabled || !root) return;
    const stop = animatePublicRoute(root);
    onCleanup(stop);
  });

  return <div class="route-motion" ref={root}>{props.children}</div>;
}
