import { Title } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import {
  createMemo,
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  type JSX,
} from "solid-js";
import { z } from "zod";
import type { SavedAddress } from "~/lib/address";
import { formatPrice, useCart } from "~/lib/cart";
import {
  findShippingDestination,
  getInternationalPostnlPrice,
  INTERNATIONAL_POSTNL_DESTINATIONS,
  NETHERLANDS,
} from "~/lib/shipping";
import {
  DEFAULT_STORE_PROFILE,
  fetchStoreProfile,
  type StoreProfile,
} from "~/lib/store-profile";
import styles from "./index.module.scss";

type ShippingMethod =
  | "postnl_letterbox"
  | "postnl_parcel"
  | "postnl_international";

const checkoutSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  address: z.string().trim().min(4).max(160),
  postalCode: z.string().trim().min(3).max(24),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(400),
  shippingMethod: z.enum([
    "postnl_letterbox",
    "postnl_parcel",
    "postnl_international",
  ]),
  paymentMethod: z.literal("mollie"),
});

const cleanInput = (value: string) => value.replace(/\s+/g, " ").trim();

type CreatePaymentResponse = {
  checkoutUrl?: string;
  error?: string;
};

type SavedAddressResponse = {
  address: SavedAddress | null;
  email: string;
};

export default function Checkout() {
  const cart = useCart();
  const [searchParams] = useSearchParams();
  const [shippingMethod, setShippingMethod] =
    createSignal<ShippingMethod>("postnl_parcel");
  const [storeProfile, setStoreProfile] =
    createSignal<StoreProfile>(DEFAULT_STORE_PROFILE);
  const [email, setEmail] = createSignal("");
  const [firstName, setFirstName] = createSignal("");
  const [lastName, setLastName] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [postalCode, setPostalCode] = createSignal("");
  const [city, setCity] = createSignal("");
  const [country, setCountry] = createSignal("Netherlands");
  const [notes, setNotes] = createSignal("");
  const [discountInput, setDiscountInput] = createSignal("");
  const [discountCode, setDiscountCode] = createSignal("");
  const [discountCents, setDiscountCents] = createSignal(0);
  const [discountMessage, setDiscountMessage] = createSignal("");
  const [checkingDiscount, setCheckingDiscount] = createSignal(false);
  const [error, setError] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const subtotalCents = () => cart.subtotalCents();
  const shippingOptions = createMemo(() => {
    const profile = storeProfile();
    const destination = findShippingDestination(country());
    if (destination && destination.code !== "NL") {
      return [{
        value: "postnl_international" as const,
        label: "PostNL international parcel",
        detail: `Tracked delivery to ${destination.name}`,
        priceCents:
          getInternationalPostnlPrice(
            destination.code,
            profile.internationalPostnlRates,
          ) ?? 0,
      }];
    }

    const options: Array<{
      value: ShippingMethod;
      label: string;
      detail: string;
      priceCents: number;
    }> = [
      {
        value: "postnl_letterbox",
        label: "PostNL letterbox parcel",
        detail: "Maximum 38 × 26.5 × 3 cm and 2 kg",
        priceCents: profile.postnlLetterboxCents,
      },
      {
        value: "postnl_parcel",
        label: "PostNL parcel",
        detail: "Tracked parcel up to 100 × 50 × 50 cm and 10 kg",
        priceCents: profile.postnlParcelCents,
      },
    ];
    return options;
  });

  createEffect(() => {
    const destination = findShippingDestination(country());
    if (!destination) return;
    if (destination.code === "NL" && shippingMethod() === "postnl_international") {
      setShippingMethod("postnl_parcel");
    }
    if (destination.code !== "NL" && shippingMethod() !== "postnl_international") {
      setShippingMethod("postnl_international");
    }
  });
  const shippingCents = createMemo(() =>
    subtotalCents() >= storeProfile().freeShippingThresholdCents
      ? 0
      : shippingOptions().find(option => option.value === shippingMethod())?.priceCents ?? 0,
  );
  const totalCents = createMemo(
    () => subtotalCents() - discountCents() + shippingCents(),
  );
  const freeShippingRemaining = createMemo(() =>
    Math.max(
      0,
      storeProfile().freeShippingThresholdCents - subtotalCents(),
    ),
  );

  const applyDiscount = async () => {
    setCheckingDiscount(true);
    setDiscountMessage("");
    try {
      const response = await fetch("/api/checkout/discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountInput(),
          subtotalCents: subtotalCents(),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        code?: string;
        discountCents?: number;
        label?: string;
      };
      if (!response.ok || !result.code || !result.discountCents) {
        setDiscountCode("");
        setDiscountCents(0);
        setDiscountMessage(result.error ?? "This code cannot be applied.");
        return;
      }
      setDiscountCode(result.code);
      setDiscountCents(result.discountCents);
      setDiscountMessage(`${result.label} applied.`);
    } catch {
      setDiscountMessage("The discount could not be checked.");
    } finally {
      setCheckingDiscount(false);
    }
  };

  onMount(async () => {
    setStoreProfile(await fetchStoreProfile());
    try {
      const response = await fetch("/api/account/address", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) return;
      const result = (await response.json()) as SavedAddressResponse;

      if (!email()) setEmail(result.email);
      if (!result.address) return;
      if (!firstName()) setFirstName(result.address.firstName);
      if (!lastName()) setLastName(result.address.lastName);
      if (!address()) setAddress(result.address.streetAndHouseNumber);
      if (!postalCode()) setPostalCode(result.address.postalCode);
      if (!city()) setCity(result.address.city);
      setCountry(
        findShippingDestination(result.address.country)?.name ?? NETHERLANDS.name,
      );
    } catch {
      // Guest checkout and temporary account-service errors stay editable.
    }
  });

  const submitOrder = async (event: SubmitEvent) => {
    event.preventDefault();
    setError("");
    const items = cart.items();

    if (items.length === 0) {
      setError("Your cart is empty. Add something before checking out.");
      return;
    }

    if (
      items.some(
        item =>
          !item.id ||
          !item.name ||
          item.quantity < 1 ||
          item.quantity > 99 ||
          item.priceCents < 1,
      )
    ) {
      setError("Something in your cart looks invalid. Please refresh it.");
      return;
    }

    const parsed = checkoutSchema.safeParse({
      email: email(),
      firstName: firstName(),
      lastName: lastName(),
      address: address(),
      postalCode: postalCode(),
      city: city(),
      country: country(),
      notes: notes(),
      shippingMethod: shippingMethod(),
      paymentMethod: "mollie",
    });

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ??
          "Check your checkout details and try again.",
      );
      return;
    }

    const values = parsed.data;
    setEmail(values.email);
    setFirstName(values.firstName);
    setLastName(values.lastName);
    setAddress(values.address);
    setPostalCode(values.postalCode);
    setCity(values.city);
    setCountry(values.country);
    setNotes(values.notes);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/checkout/create-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map(item => ({
            id: item.id,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          customer: values,
          shippingMethod: values.shippingMethod,
          paymentMethod: values.paymentMethod,
          discountCode: discountCode(),
        }),
      });
      const result = (await response.json()) as CreatePaymentResponse;

      if (!response.ok || !result.checkoutUrl) {
        setError(result.error ?? "Payment could not be started. Try again.");
        return;
      }

      window.location.assign(result.checkoutUrl);
    } catch {
      setError("Checkout is unavailable right now. Please try again later.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main class={styles.page}>
      <Title>Checkout | TCGHaven</Title>
      <div class="container">
        <Show
          when={!searchParams.order}
          fallback={<PaymentReturn orderNumber={searchParams.order} />}
        >
            <header class={styles.header}>
              <div class={styles.headerCopy}>
                <span class={styles.checkoutMark} aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
                    <path d="m9.5 12 1.7 1.7 3.6-3.8" />
                  </svg>
                </span>
                <div>
                  <h1>Checkout</h1>
                  <p>Secure payment through Mollie and tracked PostNL delivery.</p>
                </div>
              </div>
              <A href="/cart" class={styles.backLink}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                Back to cart
              </A>
            </header>

            <Show
              when={cart.items().length > 0}
              fallback={
                <section class={styles.empty}>
                  <h2>Your cart is empty</h2>
                  <p>Add cards or sealed product first, then come back here.</p>
                  <A href="/products" class={styles.primaryLink}>
                    Browse products
                  </A>
                </section>
              }
            >
              <form class={styles.layout} onSubmit={submitOrder}>
              <div class={styles.formPanel}>
                <CheckoutSection
                  title="Delivery details"
                  description="Your receipt, delivery updates, and shipping address."
                >
                  <div class={styles.gridTwo}>
                    <label class={styles.field}>
                      <span>Email</span>
                      <input
                        type="email"
                        autocomplete="email"
                        placeholder="you@example.com"
                        required
                        maxlength={254}
                        value={email()}
                        onInput={event =>
                          setEmail(cleanInput(event.currentTarget.value))
                        }
                      />
                    </label>
                    <label class={styles.field}>
                      <span>Country</span>
                      <select
                        autocomplete="country-name"
                        required
                        value={country()}
                        onChange={event => setCountry(event.currentTarget.value)}
                      >
                        <option value={NETHERLANDS.name}>{NETHERLANDS.name}</option>
                        <For each={INTERNATIONAL_POSTNL_DESTINATIONS}>
                          {destination => (
                            <option value={destination.name}>{destination.name}</option>
                          )}
                        </For>
                      </select>
                    </label>
                  </div>
                  <div class={styles.gridTwo}>
                    <label class={styles.field}>
                      <span>First name</span>
                      <input
                        type="text"
                        autocomplete="given-name"
                        required
                        maxlength={80}
                        value={firstName()}
                        onInput={event =>
                          setFirstName(cleanInput(event.currentTarget.value))
                        }
                      />
                    </label>
                    <label class={styles.field}>
                      <span>Last name</span>
                      <input
                        type="text"
                        autocomplete="family-name"
                        required
                        maxlength={80}
                        value={lastName()}
                        onInput={event =>
                          setLastName(cleanInput(event.currentTarget.value))
                        }
                      />
                    </label>
                  </div>

                  <label class={styles.field}>
                    <span>Street and house number</span>
                    <input
                      type="text"
                      autocomplete="street-address"
                      required
                      maxlength={160}
                      value={address()}
                      onInput={event =>
                        setAddress(cleanInput(event.currentTarget.value))
                      }
                    />
                  </label>

                  <div class={styles.gridTwo}>
                    <label class={styles.field}>
                      <span>Postal code</span>
                      <input
                        type="text"
                        autocomplete="postal-code"
                        required
                        maxlength={24}
                        value={postalCode()}
                        onInput={event =>
                          setPostalCode(cleanInput(event.currentTarget.value))
                        }
                      />
                    </label>
                    <label class={styles.field}>
                      <span>City</span>
                      <input
                        type="text"
                        autocomplete="address-level2"
                        required
                        maxlength={80}
                        value={city()}
                        onInput={event =>
                          setCity(cleanInput(event.currentTarget.value))
                        }
                      />
                    </label>
                  </div>
                </CheckoutSection>

                <CheckoutSection
                  title="Delivery method"
                  description="PostNL options are based on the destination above."
                >
                  <div class={styles.optionStack}>
                    <For each={shippingOptions()}>
                      {option => (
                        <label class={styles.option}>
                          <input
                            type="radio"
                            name="shipping"
                            value={option.value}
                            checked={shippingMethod() === option.value}
                            onChange={() => setShippingMethod(option.value)}
                          />
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.detail}</small>
                          </span>
                          <em>
                            {subtotalCents() >= storeProfile().freeShippingThresholdCents
                              ? "Free"
                              : formatPrice(option.priceCents)}
                          </em>
                        </label>
                      )}
                    </For>
                  </div>
                </CheckoutSection>

                <CheckoutSection
                  title="Payment"
                  description="Payment details are handled securely outside TCGHaven."
                >
                  <div class={styles.paymentProvider}>
                    <span class={styles.paymentProviderIcon} aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="M3 10h18M7 15h3" />
                      </svg>
                    </span>
                    <span>
                      <strong>Mollie secure checkout</strong>
                      <small>Choose iDEAL, Bancontact, credit card, or another available method after continuing.</small>
                    </span>
                    <em>Selected</em>
                  </div>
                </CheckoutSection>

                <details class={styles.orderNote}>
                  <summary>
                    <span>
                      <strong>Add an order note</strong>
                      <small>Optional packing or delivery instructions</small>
                    </span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <label class={styles.field}>
                    <span>Order note</span>
                    <textarea
                      rows={3}
                      maxlength={400}
                      placeholder="Anything the shop should know about this order"
                      value={notes()}
                      onInput={event => setNotes(event.currentTarget.value)}
                    />
                  </label>
                </details>
              </div>

              <aside class={styles.summary} aria-label="Order summary">
                <div class={styles.summaryHeading}>
                  <div>
                    <h2>Order summary</h2>
                    <span>{cart.count()} {cart.count() === 1 ? "item" : "items"}</span>
                  </div>
                  <A href="/cart">Edit cart</A>
                </div>
                <div class={styles.items}>
                  <For each={cart.items()}>
                    {item => (
                      <div class={styles.item}>
                        <span class={styles.itemImage}>
                          <img src={item.image} alt="" />
                          <b>x{item.quantity}</b>
                        </span>
                        <span class={styles.itemMeta}>
                          <strong>{item.name}</strong>
                          <small>{formatPrice(item.priceCents)} each</small>
                        </span>
                        <span class={styles.itemPrice}>
                          {formatPrice(item.priceCents * item.quantity)}
                        </span>
                      </div>
                    )}
                  </For>
                </div>

                <div class={styles.shippingStatus}>
                  <div>
                    <span>
                      {freeShippingRemaining() > 0
                        ? `${formatPrice(freeShippingRemaining())} away from free shipping`
                        : "Free shipping applied"}
                    </span>
                    <span>{formatPrice(storeProfile().freeShippingThresholdCents)}</span>
                  </div>
                  <span class={styles.shippingTrack} aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          (subtotalCents() /
                            Math.max(storeProfile().freeShippingThresholdCents, 1)) *
                            100,
                        )}%`,
                      }}
                    />
                  </span>
                </div>

                <div class={styles.discount}>
                  <label>
                    <span>Discount code</span>
                    <div>
                      <input
                        value={discountInput()}
                        onInput={event => setDiscountInput(event.currentTarget.value.toUpperCase())}
                        placeholder="Enter code"
                        maxlength={32}
                      />
                      <button
                        type="button"
                        onClick={applyDiscount}
                        disabled={checkingDiscount() || !discountInput().trim()}
                      >
                        {checkingDiscount() ? "Checking" : "Apply"}
                      </button>
                    </div>
                  </label>
                  <Show when={discountMessage()}>
                    <p classList={{ [styles.discountApplied]: discountCents() > 0 }}>
                      {discountMessage()}
                    </p>
                  </Show>
                </div>

                <div class={styles.totals} aria-live="polite">
                  <SummaryRow label="Subtotal" value={formatPrice(subtotalCents())} />
                  <Show when={discountCents() > 0}>
                    <SummaryRow
                      label={`Discount ${discountCode()}`}
                      value={`-${formatPrice(discountCents())}`}
                    />
                  </Show>
                  <SummaryRow
                    label="Shipping"
                    value={
                      shippingCents() === 0 ? "Free" : formatPrice(shippingCents())
                    }
                  />
                  <div class={styles.total}>
                    <span>Total</span>
                    <strong>{formatPrice(totalCents())}</strong>
                  </div>
                </div>

                <Show when={error()}>
                  <p class={styles.error} role="alert">
                    {error()}
                  </p>
                </Show>

                <button
                  type="submit"
                  class={styles.submit}
                  disabled={isSubmitting()}
                >
                  {isSubmitting()
                    ? "Preparing payment..."
                    : `Pay ${formatPrice(totalCents())} securely`}
                </button>

                <p class={styles.legalConsent}>
                  By placing the order, you agree to the <A href="/terms">terms and conditions</A> and confirm that you have read the <A href="/privacy">privacy policy</A> and <A href="/shipping">shipping and returns information</A>.
                </p>
                <p class={styles.secureNote}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z" />
                    <path d="m9.5 12 1.7 1.7 3.6-3.8" />
                  </svg>
                  Prices and stock are verified again before payment.
                </p>
              </aside>
              </form>
            </Show>
        </Show>
      </div>
    </main>
  );
}

function CheckoutSection(props: {
  title: string;
  description: string;
  children: JSX.Element;
}) {
  return (
    <section class={styles.section}>
      <header class={styles.sectionHeading}>
        <h2>{props.title}</h2>
        <p>{props.description}</p>
      </header>
      <div class={styles.sectionBody}>{props.children}</div>
    </section>
  );
}

function SummaryRow(props: { label: string; value: string }) {
  return (
    <div class={styles.summaryRow}>
      <span>{props.label}</span>
      <span>{props.value}</span>
    </div>
  );
}

type PaymentReturnData = {
  orderNumber: string;
  orderStatus:
    | "pending"
    | "paid"
    | "processing"
    | "shipped"
    | "completed"
    | "cancelled"
    | "refunded";
  paymentStatus:
    | "open"
    | "pending"
    | "authorized"
    | "paid"
    | "failed"
    | "cancelled"
    | "expired"
    | "refunded"
    | null;
  totalCents: number;
  currency: string;
  createdAt: string;
};

type ConfirmationState = "checking" | "paid" | "failed" | "unknown";

function PaymentReturn(props: { orderNumber: string | string[] | undefined }) {
  const cart = useCart();
  const [order, setOrder] = createSignal<PaymentReturnData | null>(null);
  const [error, setError] = createSignal("");
  const [refreshing, setRefreshing] = createSignal(false);
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const orderNumber = () =>
    Array.isArray(props.orderNumber) ? props.orderNumber[0] : props.orderNumber;

  const confirmationState = createMemo<ConfirmationState>(() => {
    const current = order();
    if (error() && !current) return "unknown";
    if (!current) return "checking";
    if (
      ["paid", "processing", "shipped", "completed"].includes(
        current.orderStatus,
      ) || current.paymentStatus === "paid"
    ) {
      return "paid";
    }
    if (
      current.orderStatus === "cancelled" ||
      ["failed", "cancelled", "expired"].includes(
        current.paymentStatus ?? "",
      )
    ) {
      return "failed";
    }
    return "checking";
  });

  const statusLabel = () => {
    if (confirmationState() === "paid") return "Payment confirmed";
    if (confirmationState() === "failed") return "Payment incomplete";
    if (confirmationState() === "unknown") return "Status unavailable";
    return "Confirming payment";
  };

  const heading = () => {
    if (confirmationState() === "paid") return "Your order is confirmed";
    if (confirmationState() === "failed") return "Payment was not completed";
    if (confirmationState() === "unknown") return "We could not refresh your order";
    return "We are confirming your order";
  };

  const description = () => {
    if (confirmationState() === "paid") {
      return "Your items are reserved and the shop can start preparing them. Your receipt is sent to the email used at checkout.";
    }
    if (confirmationState() === "failed") {
      return "No completed payment was recorded. You can return to the shop and try again when you are ready.";
    }
    if (confirmationState() === "unknown") {
      return "Your order reference is safe. Check again in a moment or contact us if the status does not update.";
    }
    return "This normally takes only a few seconds. You can keep this page open while we receive the final confirmation.";
  };

  const checkStatus = async (manual = false) => {
    const reference = orderNumber();
    if (!reference || refreshing()) return;
    if (timer) clearTimeout(timer);
    setRefreshing(true);
    if (manual) setError("");

    try {
      const response = await fetch(
        `/api/checkout/order-status?order=${encodeURIComponent(reference)}`,
        { headers: { Accept: "application/json" } },
      );
      const result = (await response.json()) as {
        order?: PaymentReturnData;
        error?: string;
      };
      if (!response.ok || !result.order) {
        throw new Error(result.error ?? "The order status is unavailable.");
      }
      setOrder(result.order);
      setError("");
      attempts += 1;

      if (
        ["paid", "processing", "shipped", "completed"].includes(
          result.order.orderStatus,
        ) || result.order.paymentStatus === "paid"
      ) {
        cart.clear();
        return;
      }

      const terminal =
        result.order.orderStatus === "cancelled" ||
        ["failed", "cancelled", "expired"].includes(
          result.order.paymentStatus ?? "",
        );
      if (!terminal && attempts < 10) {
        timer = setTimeout(() => void checkStatus(), 2500);
      }
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "The order status is unavailable.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  onMount(() => void checkStatus());
  onCleanup(() => {
    if (timer) clearTimeout(timer);
  });

  return (
    <section
      class={styles.confirmation}
      data-state={confirmationState()}
      aria-live="polite"
    >
      <header class={styles.confirmHeader}>
        <span class={styles.confirmIcon} aria-hidden="true">
          <Show
            when={confirmationState() !== "checking"}
            fallback={<span class={styles.statusSpinner} />}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <Show
                when={confirmationState() === "paid"}
                fallback={<path d="M6 6l12 12M18 6 6 18" />}
              >
                <path d="M20 6 9 17l-5-5" />
              </Show>
            </svg>
          </Show>
        </span>
        <div>
          <p class={styles.confirmStatus}>{statusLabel()}</p>
          <h1>{heading()}</h1>
          <p class={styles.confirmDescription}>{description()}</p>
        </div>
      </header>

      <div class={styles.confirmGrid}>
        <section class={styles.orderReceipt} aria-label="Order details">
          <header>
            <span>Order reference</span>
            <strong>{orderNumber() ?? "Unavailable"}</strong>
          </header>
          <dl>
            <div>
              <dt>Payment</dt>
              <dd>
                <span class={styles.paymentState}>
                  <i aria-hidden="true" />
                  {statusLabel()}
                </span>
              </dd>
            </div>
            <Show when={order()}>
              {current => (
                <div>
                  <dt>Order total</dt>
                  <dd>{formatPrice(current().totalCents)}</dd>
                </div>
              )}
            </Show>
            <div>
              <dt>Delivery</dt>
              <dd>PostNL tracking by email</dd>
            </div>
          </dl>
          <p>Keep this reference if you need help with your order.</p>
        </section>

        <aside class={styles.nextSteps} aria-label="What happens next">
          <h2>What happens next</h2>
          <ol>
            <li classList={{ [styles.stepComplete]: confirmationState() === "paid" }}>
              <span>1</span>
              <div>
                <strong>Payment confirmation</strong>
                <p>We match the payment securely to your order.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Careful packing</strong>
                <p>Your cards are checked and protected for transport.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>PostNL tracking</strong>
                <p>You receive the tracking link as soon as it ships.</p>
              </div>
            </li>
          </ol>
        </aside>
      </div>

      <footer class={styles.confirmFooter}>
        <div class={styles.confirmActions}>
          <A href="/account" class={styles.primaryLink}>
            View your orders
          </A>
          <A href="/products" class={styles.secondaryLink}>
            Continue shopping
          </A>
          <Show when={confirmationState() === "checking" || confirmationState() === "unknown"}>
            <button
              type="button"
              class={styles.statusButton}
              disabled={refreshing()}
              onClick={() => void checkStatus(true)}
            >
              {refreshing() ? "Checking status" : "Check status again"}
            </button>
          </Show>
        </div>
        <p>
          Need help? <A href="/contact">Contact TCGHaven</A>
        </p>
      </footer>
    </section>
  );
}
