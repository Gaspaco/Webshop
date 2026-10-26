import { createEffect } from "solid-js";
import { PRODUCT_IMAGE_INPUT_ERROR, productImageInputValue, validProductImageSource } from "~/lib/product-image-input";

export default function ProductImageInput(props: { value: string; onValueChange: (value: string) => void; placeholder?: string; autofocus?: boolean }) {
  let input: HTMLInputElement | undefined;
  createEffect(() => {
    input?.setCustomValidity(validProductImageSource(props.value) ? "" : PRODUCT_IMAGE_INPUT_ERROR);
  });
  return <input ref={input} type="text" inputmode="url" autocomplete="off" spellcheck={false}
    autofocus={props.autofocus} placeholder={props.placeholder ?? "https:// or /images/…"}
    value={productImageInputValue(props.value)}
    onInput={event => {
      const value = event.currentTarget.value;
      event.currentTarget.setCustomValidity(validProductImageSource(value) ? "" : PRODUCT_IMAGE_INPUT_ERROR);
      props.onValueChange(value);
    }} />;
}
