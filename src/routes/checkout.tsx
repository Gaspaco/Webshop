import { Title } from "@solidjs/meta";
import { A, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, Show, type JSX } from "solid-js";
import { z } from "zod";
import { formatPrice, useCart, type CartItem } from "~/lib/cart";
import styles from "./checkout.module.scss";

type ShippingMethod = "letterbox" | "tracked" | "pickup";
type PaymentMethod = "mollie" | "bank";

type CheckoutSnapshot = {
  orderNumber: string;
  email: string;
  items: CartItem[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
};

const SHIPPING_OPTIONS: Record<
  ShippingMethod,
  { label: string; detail: string; priceCents: number }
> = {
  letterbox: {
    label: "Letterbox post",
    detail: "For singles and small accessories",
    priceCents: 395,
  },
  tracked: {
    label: "Tracked parcel",
    detail: "Best for sealed product and larger orders",
    priceCents: 695,
  },
  pickup: {
    label: "Local pickup",
    detail: "Arrange a pickup moment after ordering",
    priceCents: 0,
  },
};

const checkoutSchema = z.object({
  email: z.string().trim().email().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  address: z.string().trim().min(4).max(160),
  postalCode: z.string().trim().min(3).max(24),
  city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(400),
  shippingMethod: z.enum(["letterbox", "tracked", "pickup"]),
  paymentMethod: z.enum(["mollie", "bank"]),
});

const cleanInput = (value: string) => value.replace(/\s+/g, " ").trim();

type CreatePaymentResponse = {
  checkoutUrl?: string;
  error?: string;
};

export default function Checkout() {
  const cart = useCart();
  const [searchParams] = useSearchParams();
  const [shippingMethod, setShippingMethod] =
    createSignal<ShippingMethod>("tracked");
  const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod>("mollie");
  const [email, setEmail] = createSignal("");
  const [firstName, setFirstName] = createSignal("");
  const [lastName, setLastName] = createSignal("");
  const [address, setAddress] = createSignal("");
  const [postalCode, setPostalCode] = createSignal("");
  const [city, setCity] = createSignal("");
  const [country, setCountry] = createSignal("Netherlands");
  const [notes, setNotes] = createSignal("");
  const [error, setError] = createSignal("");
  const [isSubmitting, setIsSubmitting] = createSignal(false);
  const [confirmation, setConfirmation] = createSignal<CheckoutSnapshot>();

  const subtotalCents = () => cart.subtotalCents();
  const shippingCents = createMemo(() =>
    subtotalCents() >= 10000 ? 0 : SHIPPING_OPTIONS[shippingMethod()].priceCents,
  );
  const totalCents = createMemo(() => subtotalCents() + shippingCents());

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
      paymentMethod: paymentMethod(),
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
            quantity: item.quantity,
          })),
          customer: values,
          shippingMethod: values.shippingMethod,
          paymentMethod: values.paymentMethod,
        }),
      });
      const result = (await response.json()) as CreatePaymentResponse;

      if (!response.ok || !result.checkoutUrl) {
        setError(result.error ?? "Payment could not be started. Try again.");
        return;
      }

      cart.clear();
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
          <Show
            when={!confirmation()}
            fallback={<Confirmation order={confirmation()!} />}
          >
            <header class={styles.header}>
              <span class={styles.kicker}>Secure checkout</span>
              <h1>Finish your order</h1>
              <p>
                Review your cards, choose delivery, and leave the details we need
                to pack it right.
              </p>
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
              <section class={styles.formPanel} aria-label="Checkout details">
                <CheckoutSection title="Contact">
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
                      <input
                        type="text"
                        autocomplete="country-name"
                        required
                        maxlength={80}
                        value={country()}
                        onInput={event =>
                          setCountry(cleanInput(event.currentTarget.value))
                        }
                      />
                    </label>
                  </div>
                </CheckoutSection>

                <CheckoutSection title="Delivery address">
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

                <CheckoutSection title="Shipping">
                  <div class={styles.optionStack}>
                    <For each={Object.entries(SHIPPING_OPTIONS)}>
                      {([value, option]) => (
                        <label class={styles.option}>
                          <input
                            type="radio"
                            name="shipping"
                            value={value}
                            checked={shippingMethod() === value}
                            onChange={() =>
                              setShippingMethod(value as ShippingMethod)
                            }
                          />
                          <span>
                            <strong>{option.label}</strong>
                            <small>{option.detail}</small>
                          </span>
                          <em>
                            {subtotalCents() >= 10000
                              ? "Free"
                              : formatPrice(option.priceCents)}
                          </em>
                        </label>
                      )}
                    </For>
                  </div>
                </CheckoutSection>

                <CheckoutSection title="Payment">
                  <div class={styles.optionStack}>
                    <label class={styles.option}>
                      <input
                        type="radio"
                        name="payment"
                        value="mollie"
                        checked={paymentMethod() === "mollie"}
                        onChange={() => setPaymentMethod("mollie")}
                      />
                      <span>
                        <strong>Mollie checkout</strong>
                        <small>iDEAL, Bancontact, card, and more</small>
                      </span>
                    </label>
                    <label class={styles.option}>
                      <input
                        type="radio"
                        name="payment"
                        value="bank"
                        checked={paymentMethod() === "bank"}
                        onChange={() => setPaymentMethod("bank")}
                      />
                      <span>
                        <strong>Bank transfer</strong>
                        <small>We reserve your order while payment arrives</small>
                      </span>
                    </label>
                  </div>
                </CheckoutSection>

                <CheckoutSection title="Order note">
                  <label class={styles.field}>
                    <span>Anything we should know?</span>
                    <textarea
                      rows={4}
                      maxlength={400}
                      placeholder="Condition questions, pickup timing, or packing notes"
                      value={notes()}
                      onInput={event => setNotes(event.currentTarget.value)}
                    />
                  </label>
                </CheckoutSection>
              </section>

              <aside class={styles.summary} aria-label="Order summary">
                <h2>Order summary</h2>
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

                <div class={styles.totals}>
                  <SummaryRow label="Subtotal" value={formatPrice(subtotalCents())} />
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
                    ? "Placing order..."
                    : paymentMethod() === "mollie"
                      ? "Continue to payment"
                      : "Place order"}
                </button>

                <p class={styles.secureNote}>
                  Prices and shipping are recalculated on the server before Mollie
                  receives the payment.
                </p>
              </aside>
              </form>
            </Show>
          </Show>
        </Show>
      </div>
    </main>
  );
}

function CheckoutSection(props: { title: string; children: JSX.Element }) {
  return (
    <section class={styles.section}>
      <h2>{props.title}</h2>
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

function Confirmation(props: { order: CheckoutSnapshot }) {
  return (
    <section class={styles.confirmation}>
      <span class={styles.confirmIcon}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <p class={styles.kicker}>Order placed</p>
      <h1>Thanks, your cards are reserved.</h1>
      <p>
        Order {props.order.orderNumber} was created for {props.order.email}. A
        real payment link can be wired to Mollie when the checkout backend is
        ready.
      </p>

      <div class={styles.confirmSummary}>
        <SummaryRow label="Items" value={`${props.order.items.length}`} />
        <SummaryRow
          label="Shipping"
          value={
            props.order.shippingCents === 0
              ? "Free"
              : formatPrice(props.order.shippingCents)
          }
        />
        <div class={styles.total}>
          <span>Total</span>
          <strong>{formatPrice(props.order.totalCents)}</strong>
        </div>
      </div>

      <div class={styles.confirmActions}>
        <A href="/products" class={styles.primaryLink}>
          Continue shopping
        </A>
        <A href="/account" class={styles.secondaryLink}>
          View account
        </A>
      </div>
    </section>
  );
}

function PaymentReturn(props: { orderNumber: string | string[] | undefined }) {
  const orderNumber = () =>
    Array.isArray(props.orderNumber) ? props.orderNumber[0] : props.orderNumber;

  return (
    <section class={styles.confirmation}>
      <span class={styles.confirmIcon}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <p class={styles.kicker}>Payment received</p>
      <h1>We are checking your payment.</h1>
      <p>
        Mollie sent you back to TCGHaven. If payment is complete, the webhook
        will mark order {orderNumber() ?? "your order"} as paid.
      </p>

      <div class={styles.confirmActions}>
        <A href="/products" class={styles.primaryLink}>
          Continue shopping
        </A>
        <A href="/account" class={styles.secondaryLink}>
          View account
        </A>
      </div>
    </section>
  );
}
