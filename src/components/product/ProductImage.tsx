import { createEffect, createMemo, createSignal, onCleanup, Show, splitProps, type JSX } from "solid-js";
import { nextProductImage, productImageCandidates, productImageDecoded } from "~/lib/product-image-fallback";

type Props = Omit<JSX.ImgHTMLAttributes<HTMLImageElement>, "src" | "onLoad" | "onError" | "ref"> & {
  src?: string;
  fallbackSources?: readonly (string | undefined)[];
  placeholder?: JSX.Element;
  pending?: JSX.Element;
  ref?: (image: HTMLImageElement) => void;
};

/** Bounded fallback chain, with cached/hydrated images recognized without a load event. */
export default function ProductImage(props: Props) {
  const [local, imageProps] = splitProps(props, ["src", "fallbackSources", "placeholder", "pending", "ref"]);
  const candidates = createMemo(() => productImageCandidates(local.src, local.fallbackSources), [], {
    equals: (a, b) => a.length === b.length && a.every((value, index) => value === b[index]),
  });
  const failures = createMemo(() => { candidates(); return createSignal<ReadonlySet<string>>(new Set()); });
  const source = createMemo(() => nextProductImage(candidates(), failures()[0]()));
  const [loadedSource, setLoadedSource] = createSignal<string>();
  let image: HTMLImageElement | undefined;
  let disposed = false;
  onCleanup(() => { disposed = true; });
  const failSource = (failed: string) => {
    if (failed !== source()) return;
    failures()[1](previous => new Set([...previous, failed]));
  };

  createEffect(() => {
    const current = source();
    setLoadedSource(undefined);
    // Load events can precede hydration, or src can be updated before this effect.
    queueMicrotask(() => {
      if (!disposed && current && source() === current && image?.getAttribute("src") === current && image.complete) {
        if (productImageDecoded(image)) setLoadedSource(current);
        else failSource(current);
      }
    });
  });

  return <Show when={source()} fallback={local.placeholder}>
    <Show when={loadedSource() !== source()}>{local.pending}</Show>
    <img {...imageProps}
      ref={element => { image = element; local.ref?.(element); }}
      src={source()}
      onLoad={event => {
        if (event.currentTarget.getAttribute("src") === source()) setLoadedSource(source());
      }}
      onError={event => {
        const failed = event.currentTarget.getAttribute("src");
        if (failed) failSource(failed);
      }} />
  </Show>;
}
