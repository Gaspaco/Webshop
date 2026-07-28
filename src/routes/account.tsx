import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { authClient } from "~/lib/auth-client";
import {
  meetsPasswordRequirements,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "~/lib/password";
import styles from "./account.module.scss";

type Section =
  | "overview"
  | "orders"
  | "wishlist"
  | "addresses"
  | "profile"
  | "security";

type AccountOrder = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  totalCents: number;
  createdAt: string;
  items: Array<{ name: string; quantity: number }>;
};

type WishlistItem = {
  id: string;
  slug: string;
  name: string;
  game: string | null;
  image: string | null;
  createdAt: string;
};

type AccountOverview = {
  orders: AccountOrder[];
  wishlist: WishlistItem[];
  latestAddress: Record<string, string> | null;
};

const NAV_ITEMS: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "wishlist", label: "Wishlist" },
  { id: "addresses", label: "Addresses" },
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
];

const SECTION_COPY: Record<Section, { title: string; description: string }> = {
  overview: {
    title: "Account overview",
    description: "A quick look at your collection activity.",
  },
  orders: {
    title: "Your orders",
    description: "Review purchases and follow their current status.",
  },
  wishlist: {
    title: "Your wishlist",
    description: "The cards and sealed products you saved for later.",
  },
  addresses: {
    title: "Delivery address",
    description: "Your most recently used shipping destination.",
  },
  profile: {
    title: "Profile details",
    description: "Keep your customer information accurate.",
  },
  security: {
    title: "Security",
    description: "Manage your password and active sign-ins.",
  },
};

function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("en-NL", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function readableStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

async function loadOverview() {
  const response = await fetch("/api/account/overview", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Account details could not be loaded.");
  }

  return response.json() as Promise<AccountOverview>;
}

export default function Account() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [activeSection, setActiveSection] = createSignal<Section>("overview");
  const [profileName, setProfileName] = createSignal("");
  const [profileStatus, setProfileStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [profileMessage, setProfileMessage] = createSignal("");
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [securityStatus, setSecurityStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [securityMessage, setSecurityMessage] = createSignal("");
  let profileInitialized = false;

  const [overview] = createResource(
    () => session().data?.user.id,
    loadOverview,
  );

  createEffect(() => {
    if (!session().isPending && !session().data) {
      navigate("/login", { replace: true });
    }
  });

  createEffect(() => {
    const name = session().data?.user.name;
    if (name && !profileInitialized) {
      setProfileName(name);
      profileInitialized = true;
    }
  });

  const initials = () => {
    const name = session().data?.user.name ?? "";
    return name
      .split(" ")
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const totalSpent = () =>
    overview()?.orders.reduce((total, order) => total + order.totalCents, 0) ?? 0;

  const saveProfile = async (event: SubmitEvent) => {
    event.preventDefault();
    const name = profileName().normalize("NFKC").trim();

    if (!name || name.length > 80) {
      setProfileStatus("error");
      setProfileMessage("Enter a name between 1 and 80 characters.");
      return;
    }

    setProfileStatus("saving");
    setProfileMessage("");
    const { error } = await authClient.updateUser({ name });

    if (error) {
      setProfileStatus("error");
      setProfileMessage("Your profile could not be updated. Try again.");
      return;
    }

    setProfileStatus("success");
    setProfileMessage("Profile details saved.");
  };

  const resendVerification = async () => {
    const email = session().data?.user.email;
    if (!email) return;

    setProfileStatus("saving");
    setProfileMessage("");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `${window.location.origin}/verify-email?verified=true`,
    });

    if (error) {
      setProfileStatus("error");
      setProfileMessage("A verification email could not be sent right now.");
      return;
    }

    setProfileStatus("success");
    setProfileMessage("A new verification link is on its way.");
  };

  const updatePassword = async (event: SubmitEvent) => {
    event.preventDefault();

    if (!meetsPasswordRequirements(newPassword())) {
      setSecurityStatus("error");
      setSecurityMessage(PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }

    if (newPassword() !== confirmPassword()) {
      setSecurityStatus("error");
      setSecurityMessage("The new passwords do not match.");
      return;
    }

    setSecurityStatus("saving");
    setSecurityMessage("");
    const { error } = await authClient.changePassword({
      currentPassword: currentPassword(),
      newPassword: newPassword(),
      revokeOtherSessions: true,
    });

    if (error) {
      setSecurityStatus("error");
      setSecurityMessage("Check your current password and try again.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSecurityStatus("success");
    setSecurityMessage("Password updated and other sessions signed out.");
  };

  const revokeOtherSessions = async () => {
    setSecurityStatus("saving");
    setSecurityMessage("");
    const { error } = await authClient.revokeOtherSessions();

    if (error) {
      setSecurityStatus("error");
      setSecurityMessage("Other sessions could not be signed out.");
      return;
    }

    setSecurityStatus("success");
    setSecurityMessage("All other sessions have been signed out.");
  };

  const signOut = async () => {
    await authClient.signOut();
    navigate("/", { replace: true });
  };

  return (
    <main class={styles.page}>
      <Title>Your account | TCGHaven</Title>

      <Show
        when={!session().isPending && session().data}
        fallback={
          <div class={styles.loading} role="status">
            <span />
            Loading your account
          </div>
        }
      >
        {data => (
          <div class={styles.account}>
            <header class={styles.hero}>
              <div>
                <span class={styles.eyebrow}>Customer account</span>
                <h1>Welcome back, {data().user.name.split(" ")[0]}.</h1>
              </div>
              <div class={styles.heroMeta}>
                <span>Member since</span>
                <strong>{formatDate(data().user.createdAt)}</strong>
              </div>
            </header>

            <div class={styles.dashboard}>
              <aside class={styles.sidebar}>
                <div class={styles.identity}>
                  <span class={styles.avatar}>{initials() || "?"}</span>
                  <div>
                    <strong>{data().user.name}</strong>
                    <span>{data().user.email}</span>
                  </div>
                </div>

                <nav class={styles.navigation} aria-label="Account sections">
                  <For each={NAV_ITEMS}>
                    {(item, index) => (
                      <button
                        type="button"
                        class={styles.navItem}
                        classList={{ [styles.navItemActive]: activeSection() === item.id }}
                        aria-current={activeSection() === item.id ? "page" : undefined}
                        onClick={() => setActiveSection(item.id)}
                      >
                        <span>{String(index() + 1).padStart(2, "0")}</span>
                        {item.label}
                      </button>
                    )}
                  </For>
                </nav>

                <button type="button" class={styles.signOut} onClick={signOut}>
                  Sign out
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="m16 17 5-5-5-5M21 12H9" />
                  </svg>
                </button>
              </aside>

              <section class={styles.workspace}>
                <header class={styles.sectionHeader}>
                  <div>
                    <span class={styles.sectionIndex}>
                      {String(NAV_ITEMS.findIndex(item => item.id === activeSection()) + 1).padStart(2, "0")} / 06
                    </span>
                    <h2>{SECTION_COPY[activeSection()].title}</h2>
                    <p>{SECTION_COPY[activeSection()].description}</p>
                  </div>
                  <Show when={overview.loading}>
                    <span class={styles.syncing}>Syncing</span>
                  </Show>
                </header>

                <Show when={overview.error}>
                  <div class={styles.errorState} role="alert">
                    <strong>Account activity is temporarily unavailable.</strong>
                    <span>Your profile and security settings still work.</span>
                  </div>
                </Show>

                <Switch>
                  <Match when={activeSection() === "overview"}>
                    <div class={styles.stats}>
                      <article>
                        <span>Orders</span>
                        <strong>{overview()?.orders.length ?? 0}</strong>
                        <small>All purchases</small>
                      </article>
                      <article>
                        <span>Wishlist</span>
                        <strong>{overview()?.wishlist.length ?? 0}</strong>
                        <small>Saved products</small>
                      </article>
                      <article>
                        <span>Total spent</span>
                        <strong class={styles.money}>{formatMoney(totalSpent())}</strong>
                        <small>Across your account</small>
                      </article>
                    </div>

                    <div class={styles.overviewGrid}>
                      <section class={styles.panel}>
                        <div class={styles.panelHead}>
                          <div>
                            <span>Recent activity</span>
                            <h3>Latest orders</h3>
                          </div>
                          <button type="button" onClick={() => setActiveSection("orders")}>
                            View all
                          </button>
                        </div>

                        <Show
                          when={overview()?.orders.length}
                          fallback={
                            <div class={styles.compactEmpty}>
                              <strong>No orders yet</strong>
                              <span>Your first order will appear here.</span>
                              <A href="/products">Explore the shop</A>
                            </div>
                          }
                        >
                          <div class={styles.recentOrders}>
                            <For each={overview()?.orders.slice(0, 3)}>
                              {order => (
                                <div class={styles.recentOrder}>
                                  <div>
                                    <strong>{order.orderNumber}</strong>
                                    <span>{formatDate(order.createdAt)}</span>
                                  </div>
                                  <span class={styles.status}>{readableStatus(order.status)}</span>
                                  <strong>{formatMoney(order.totalCents, order.currency)}</strong>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                      </section>

                      <section class={`${styles.panel} ${styles.quickPanel}`}>
                        <div class={styles.panelHead}>
                          <div>
                            <span>Shortcuts</span>
                            <h3>Quick actions</h3>
                          </div>
                        </div>
                        <button type="button" onClick={() => setActiveSection("wishlist")}>
                          Open wishlist <span>01</span>
                        </button>
                        <button type="button" onClick={() => setActiveSection("profile")}>
                          Edit profile <span>02</span>
                        </button>
                        <A href="/contact">
                          Contact support <span>03</span>
                        </A>
                      </section>
                    </div>
                  </Match>

                  <Match when={activeSection() === "orders"}>
                    <Show
                      when={overview()?.orders.length}
                      fallback={
                        <EmptyState
                          number="01"
                          title="No orders yet"
                          copy="Your purchases will appear here with their payment and delivery status."
                          action="Start shopping"
                          href="/products"
                        />
                      }
                    >
                      <div class={styles.orderList}>
                        <For each={overview()?.orders}>
                          {order => (
                            <article class={styles.orderRow}>
                              <div class={styles.orderMain}>
                                <span>{formatDate(order.createdAt)}</span>
                                <strong>{order.orderNumber}</strong>
                                <small>
                                  {order.items.length
                                    ? order.items.map(item => `${item.quantity} x ${item.name}`).join(", ")
                                    : "Order details"}
                                </small>
                              </div>
                              <span class={styles.status}>{readableStatus(order.status)}</span>
                              <strong class={styles.orderTotal}>
                                {formatMoney(order.totalCents, order.currency)}
                              </strong>
                            </article>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Match>

                  <Match when={activeSection() === "wishlist"}>
                    <Show
                      when={overview()?.wishlist.length}
                      fallback={
                        <EmptyState
                          number="02"
                          title="Nothing saved yet"
                          copy="Save cards and sealed products you want to revisit."
                          action="Browse the collection"
                          href="/products"
                        />
                      }
                    >
                      <div class={styles.wishlistGrid}>
                        <For each={overview()?.wishlist}>
                          {item => (
                            <A href={`/products/${item.slug}`} class={styles.wishlistItem}>
                              <div class={styles.wishlistImage}>
                                <img src={item.image ?? "/images/logo-mark.png"} alt="" />
                              </div>
                              <span>{item.game ?? "TCG"}</span>
                              <strong>{item.name}</strong>
                              <small>Saved {formatDate(item.createdAt)}</small>
                            </A>
                          )}
                        </For>
                      </div>
                    </Show>
                  </Match>

                  <Match when={activeSection() === "addresses"}>
                    <Show
                      when={overview()?.latestAddress}
                      fallback={
                        <EmptyState
                          number="03"
                          title="No saved address"
                          copy="Your latest delivery address will be saved here after checkout."
                          action="Visit the shop"
                          href="/products"
                        />
                      }
                    >
                      {address => (
                        <div class={styles.addressLayout}>
                          <article class={styles.addressCard}>
                            <div class={styles.addressTop}>
                              <span>Latest delivery address</span>
                              <strong>Default</strong>
                            </div>
                            <address>
                              <strong>
                                {[address().firstName, address().lastName].filter(Boolean).join(" ")}
                              </strong>
                              <span>{address().streetAndHouseNumber}</span>
                              <span>{[address().postalCode, address().city].filter(Boolean).join(" ")}</span>
                              <span>{address().country}</span>
                            </address>
                          </article>
                          <div class={styles.addressNote}>
                            <span>How addresses work</span>
                            <p>
                              Delivery details are taken from checkout so every order can use the right destination.
                            </p>
                            <A href="/checkout">Review at checkout</A>
                          </div>
                        </div>
                      )}
                    </Show>
                  </Match>

                  <Match when={activeSection() === "profile"}>
                    <div class={styles.settingsGrid}>
                      <form class={styles.settingsPanel} onSubmit={saveProfile}>
                        <div class={styles.settingsTitle}>
                          <span>Personal information</span>
                          <h3>Your details</h3>
                        </div>

                        <label class={styles.field}>
                          <span>Full name</span>
                          <input
                            value={profileName()}
                            maxlength="80"
                            autocomplete="name"
                            onInput={event => setProfileName(event.currentTarget.value)}
                          />
                        </label>

                        <label class={styles.field}>
                          <span>Email address</span>
                          <input value={data().user.email} type="email" disabled />
                          <small>Email changes require support to protect your orders.</small>
                        </label>

                        <Show when={profileMessage()}>
                          <p
                            class={styles.formMessage}
                            classList={{ [styles.formError]: profileStatus() === "error" }}
                            role={profileStatus() === "error" ? "alert" : "status"}
                          >
                            {profileMessage()}
                          </p>
                        </Show>

                        <button class={styles.primaryAction} disabled={profileStatus() === "saving"}>
                          {profileStatus() === "saving" ? "Saving" : "Save profile"}
                        </button>
                      </form>

                      <section class={styles.settingsPanel}>
                        <div class={styles.settingsTitle}>
                          <span>Email status</span>
                          <h3>Verification</h3>
                        </div>
                        <div class={styles.verificationState}>
                          <span classList={{ [styles.verified]: data().user.emailVerified }}>
                            {data().user.emailVerified ? "Verified" : "Verification needed"}
                          </span>
                          <p>
                            {data().user.emailVerified
                              ? "Your email address is verified and ready for account notifications."
                              : "Verify your email to keep account recovery and order updates secure."}
                          </p>
                        </div>
                        <Show when={!data().user.emailVerified}>
                          <button
                            type="button"
                            class={styles.secondaryAction}
                            disabled={profileStatus() === "saving"}
                            onClick={resendVerification}
                          >
                            Send verification email
                          </button>
                        </Show>
                      </section>
                    </div>
                  </Match>

                  <Match when={activeSection() === "security"}>
                    <div class={styles.settingsGrid}>
                      <form class={styles.settingsPanel} onSubmit={updatePassword}>
                        <div class={styles.settingsTitle}>
                          <span>Password</span>
                          <h3>Change password</h3>
                        </div>

                        <label class={styles.field}>
                          <span>Current password</span>
                          <input
                            type="password"
                            value={currentPassword()}
                            autocomplete="current-password"
                            required
                            onInput={event => setCurrentPassword(event.currentTarget.value)}
                          />
                        </label>
                        <label class={styles.field}>
                          <span>New password</span>
                          <input
                            type="password"
                            value={newPassword()}
                            minlength={PASSWORD_MIN_LENGTH}
                            maxlength={PASSWORD_MAX_LENGTH}
                            autocomplete="new-password"
                            required
                            onInput={event => setNewPassword(event.currentTarget.value)}
                          />
                        </label>
                        <label class={styles.field}>
                          <span>Confirm new password</span>
                          <input
                            type="password"
                            value={confirmPassword()}
                            minlength={PASSWORD_MIN_LENGTH}
                            maxlength={PASSWORD_MAX_LENGTH}
                            autocomplete="new-password"
                            required
                            onInput={event => setConfirmPassword(event.currentTarget.value)}
                          />
                        </label>

                        <Show when={securityMessage()}>
                          <p
                            class={styles.formMessage}
                            classList={{ [styles.formError]: securityStatus() === "error" }}
                            role={securityStatus() === "error" ? "alert" : "status"}
                          >
                            {securityMessage()}
                          </p>
                        </Show>

                        <button class={styles.primaryAction} disabled={securityStatus() === "saving"}>
                          {securityStatus() === "saving" ? "Updating" : "Update password"}
                        </button>
                      </form>

                      <section class={styles.settingsPanel}>
                        <div class={styles.settingsTitle}>
                          <span>Active sessions</span>
                          <h3>Signed-in devices</h3>
                        </div>
                        <p class={styles.settingsCopy}>
                          If you used a shared device or notice unfamiliar activity, sign out every other session.
                        </p>
                        <button
                          type="button"
                          class={styles.secondaryAction}
                          disabled={securityStatus() === "saving"}
                          onClick={revokeOtherSessions}
                        >
                          Sign out other devices
                        </button>
                        <A href="/reset-password" class={styles.textAction}>
                          Forgot your current password?
                        </A>
                      </section>
                    </div>
                  </Match>
                </Switch>
              </section>
            </div>
          </div>
        )}
      </Show>
    </main>
  );
}

function EmptyState(props: {
  number: string;
  title: string;
  copy: string;
  action: string;
  href: string;
}) {
  return (
    <div class={styles.emptyState}>
      <span>{props.number}</span>
      <h3>{props.title}</h3>
      <p>{props.copy}</p>
      <A href={props.href}>{props.action}</A>
    </div>
  );
}
