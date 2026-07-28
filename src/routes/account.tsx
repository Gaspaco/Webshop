import { Title } from "@solidjs/meta";
import { A, useNavigate } from "@solidjs/router";
import QRCode from "qrcode";
import {
  createEffect,
  createResource,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { savedAddressSchema } from "~/lib/address";
import { authClient } from "~/lib/auth-client";
import {
  meetsPasswordRequirements,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
} from "~/lib/password";
import {
  PROFILE_IMAGE_ACCEPTED_TYPES,
  PROFILE_IMAGE_ERROR_MESSAGE,
  PROFILE_IMAGE_MAX_DATA_URL_LENGTH,
  PROFILE_IMAGE_MAX_SOURCE_BYTES,
} from "~/lib/profile-image";
import styles from "./account.module.scss";

type Section =
  | "overview"
  | "orders"
  | "wishlist"
  | "addresses"
  | "payments"
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

type AccountPayment = {
  id: string;
  orderId: string;
  orderNumber: string;
  status: string;
  method: string | null;
  amountCents: number;
  createdAt: string;
};

type AccountOverview = {
  orders: AccountOrder[];
  wishlist: WishlistItem[];
  payments: AccountPayment[];
  latestAddress: Record<string, string> | null;
  hasSavedAddress: boolean;
};

const NAV_ITEMS: Array<{ id: Section; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
  { id: "wishlist", label: "Wishlist" },
  { id: "addresses", label: "Addresses" },
  { id: "payments", label: "Payments" },
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
  payments: {
    title: "Payments",
    description: "Review the payment activity connected to your orders.",
  },
  profile: {
    title: "Profile details",
    description: "Keep your customer information accurate.",
  },
  security: {
    title: "Security",
    description: "Manage your password, two-factor protection, and sign-ins.",
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

function readablePaymentMethod(method: string | null) {
  if (!method) return "Mollie checkout";

  return method
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

async function prepareProfileImage(file: File) {
  if (
    !PROFILE_IMAGE_ACCEPTED_TYPES.includes(
      file.type as (typeof PROFILE_IMAGE_ACCEPTED_TYPES)[number],
    ) ||
    file.size > PROFILE_IMAGE_MAX_SOURCE_BYTES
  ) {
    throw new Error(PROFILE_IMAGE_ERROR_MESSAGE);
  }

  const source = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const outputSize = 512;
  const cropSize = Math.min(source.width, source.height);
  const sourceX = (source.width - cropSize) / 2;
  const sourceY = (source.height - cropSize) / 2;

  canvas.width = outputSize;
  canvas.height = outputSize;

  if (!context) {
    source.close();
    throw new Error("This image could not be prepared. Choose another file.");
  }

  context.fillStyle = "#101512";
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    source,
    sourceX,
    sourceY,
    cropSize,
    cropSize,
    0,
    0,
    outputSize,
    outputSize,
  );
  source.close();

  let image = canvas.toDataURL("image/webp", 0.8);
  if (!image.startsWith("data:image/webp")) {
    image = canvas.toDataURL("image/jpeg", 0.78);
  }
  if (image.length > PROFILE_IMAGE_MAX_DATA_URL_LENGTH) {
    image = canvas.toDataURL("image/jpeg", 0.68);
  }
  if (image.length > PROFILE_IMAGE_MAX_DATA_URL_LENGTH) {
    throw new Error("This image is too detailed. Choose a smaller image.");
  }

  return image;
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
  const [profileImage, setProfileImage] = createSignal<string | null>(null);
  const [profileStatus, setProfileStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [profileMessage, setProfileMessage] = createSignal("");
  const [addressFirstName, setAddressFirstName] = createSignal("");
  const [addressLastName, setAddressLastName] = createSignal("");
  const [addressStreet, setAddressStreet] = createSignal("");
  const [addressPostalCode, setAddressPostalCode] = createSignal("");
  const [addressCity, setAddressCity] = createSignal("");
  const [addressCountry, setAddressCountry] = createSignal("Netherlands");
  const [addressStatus, setAddressStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [addressMessage, setAddressMessage] = createSignal("");
  const [newEmail, setNewEmail] = createSignal("");
  const [emailStatus, setEmailStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [emailMessage, setEmailMessage] = createSignal("");
  const [currentPassword, setCurrentPassword] = createSignal("");
  const [newPassword, setNewPassword] = createSignal("");
  const [confirmPassword, setConfirmPassword] = createSignal("");
  const [securityStatus, setSecurityStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [securityMessage, setSecurityMessage] = createSignal("");
  const [twoFactorPassword, setTwoFactorPassword] = createSignal("");
  const [twoFactorCode, setTwoFactorCode] = createSignal("");
  const [twoFactorQr, setTwoFactorQr] = createSignal("");
  const [backupCodes, setBackupCodes] = createSignal<string[]>([]);
  const [twoFactorStatus, setTwoFactorStatus] = createSignal<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [twoFactorMessage, setTwoFactorMessage] = createSignal("");
  let profileInitialized = false;
  let addressInitialized = false;

  const [overview, { refetch: refetchOverview }] = createResource(
    () => session().data?.user.id,
    loadOverview,
  );

  createEffect(() => {
    if (!session().isPending && !session().data) {
      navigate("/login", { replace: true });
    }
  });

  createEffect(() => {
    const account = overview();
    if (!account || addressInitialized) return;

    const address = account.latestAddress;
    if (address) {
      setAddressFirstName(address.firstName ?? "");
      setAddressLastName(address.lastName ?? "");
      setAddressStreet(address.streetAndHouseNumber ?? "");
      setAddressPostalCode(address.postalCode ?? "");
      setAddressCity(address.city ?? "");
      setAddressCountry(address.country ?? "Netherlands");
    } else {
      const name = (session().data?.user.name ?? "").trim().split(/\s+/);
      setAddressFirstName(name[0] ?? "");
      setAddressLastName(name.slice(1).join(" "));
    }

    addressInitialized = true;
  });

  createEffect(() => {
    const name = session().data?.user.name;
    if (name && !profileInitialized) {
      setProfileName(name);
      setProfileImage(session().data?.user.image ?? null);
      setNewEmail(session().data?.user.email ?? "");
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

  const selectProfileImage = async (
    event: Event & { currentTarget: HTMLInputElement },
  ) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;

    setProfileStatus("saving");
    setProfileMessage("");

    try {
      setProfileImage(await prepareProfileImage(file));
      setProfileStatus("idle");
      setProfileMessage("Image ready. Save your profile to apply it.");
    } catch (error) {
      setProfileStatus("error");
      setProfileMessage(
        error instanceof Error ? error.message : PROFILE_IMAGE_ERROR_MESSAGE,
      );
    }
  };

  const removeProfileImage = () => {
    setProfileImage(null);
    setProfileStatus("idle");
    setProfileMessage("Image removed. Save your profile to apply it.");
  };

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
    const { error } = await authClient.updateUser({
      name,
      image: profileImage(),
    });

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

  const requestEmailChange = async (event: SubmitEvent) => {
    event.preventDefault();
    const email = newEmail().normalize("NFKC").trim().toLowerCase();
    const currentEmail = session().data?.user.email.toLowerCase();

    if (!email || email === currentEmail) {
      setEmailStatus("error");
      setEmailMessage("Enter a different email address.");
      return;
    }

    setEmailStatus("saving");
    setEmailMessage("");
    const { error } = await authClient.changeEmail({
      newEmail: email,
      callbackURL: `${window.location.origin}/account?emailChanged=true`,
    });

    if (error) {
      setEmailStatus("error");
      setEmailMessage(
        error.status === 429
          ? "Too many email-change requests. Wait a few minutes and try again."
          : "The verification email could not be sent. Check the address and try again.",
      );
      return;
    }

    setEmailStatus("success");
    setEmailMessage(
      "Verification sent to the new address. Your current email stays active until you confirm it.",
    );
  };

  const saveAddress = async (event: SubmitEvent) => {
    event.preventDefault();
    const parsed = savedAddressSchema.safeParse({
      firstName: addressFirstName(),
      lastName: addressLastName(),
      streetAndHouseNumber: addressStreet(),
      postalCode: addressPostalCode(),
      city: addressCity(),
      country: addressCountry(),
    });

    if (!parsed.success) {
      setAddressStatus("error");
      setAddressMessage(
        parsed.error.issues[0]?.message ??
          "Check the address and try again.",
      );
      return;
    }

    setAddressStatus("saving");
    setAddressMessage("");

    try {
      const response = await fetch("/api/account/address", {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setAddressStatus("error");
        setAddressMessage(
          result.error ?? "Your address could not be saved.",
        );
        return;
      }

      setAddressStatus("success");
      setAddressMessage("Address saved and ready for checkout.");
      await refetchOverview();
    } catch {
      setAddressStatus("error");
      setAddressMessage("Your address could not be saved. Try again.");
    }
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

  const beginTwoFactor = async (event: SubmitEvent) => {
    event.preventDefault();

    if (!twoFactorPassword()) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Enter your current password to continue.");
      return;
    }

    setTwoFactorStatus("saving");
    setTwoFactorMessage("");
    const { data, error } = await authClient.twoFactor.enable({
      password: twoFactorPassword(),
      issuer: "TCGHaven",
    });

    if (error || !data) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Your password was not accepted. Try again.");
      return;
    }

    try {
      const qr = await QRCode.toDataURL(data.totpURI, {
        width: 240,
        margin: 1,
        color: {
          dark: "#07110d",
          light: "#ffffff",
        },
      });
      setTwoFactorQr(qr);
      setBackupCodes(data.backupCodes);
      setTwoFactorPassword("");
      setTwoFactorStatus("idle");
      setTwoFactorMessage(
        "Scan the code, then enter the current six-digit code to finish setup.",
      );
    } catch {
      setTwoFactorStatus("error");
      setTwoFactorMessage("The authenticator setup code could not be prepared.");
    }
  };

  const confirmTwoFactor = async (event: SubmitEvent) => {
    event.preventDefault();
    const code = twoFactorCode().replace(/\s+/g, "");

    if (!/^\d{6}$/.test(code)) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Enter the six-digit code from your authenticator app.");
      return;
    }

    setTwoFactorStatus("saving");
    setTwoFactorMessage("");
    const { error } = await authClient.twoFactor.verifyTotp({ code });

    if (error) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("That code was not accepted. Wait for a new code and try again.");
      return;
    }

    setTwoFactorCode("");
    setTwoFactorQr("");
    setTwoFactorStatus("success");
    setTwoFactorMessage(
      "Two-factor authentication is active. Save the recovery codes below.",
    );
  };

  const regenerateBackupCodes = async (event: SubmitEvent) => {
    event.preventDefault();

    if (!twoFactorPassword()) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Enter your current password to create new recovery codes.");
      return;
    }

    setTwoFactorStatus("saving");
    setTwoFactorMessage("");
    const { data, error } = await authClient.twoFactor.generateBackupCodes({
      password: twoFactorPassword(),
    });

    if (error || !data) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("New recovery codes could not be created.");
      return;
    }

    setBackupCodes(data.backupCodes);
    setTwoFactorPassword("");
    setTwoFactorStatus("success");
    setTwoFactorMessage(
      "New recovery codes created. Your previous codes no longer work.",
    );
  };

  const disableTwoFactor = async () => {
    if (!twoFactorPassword()) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Enter your current password before turning off two-factor authentication.");
      return;
    }

    setTwoFactorStatus("saving");
    setTwoFactorMessage("");
    const { error } = await authClient.twoFactor.disable({
      password: twoFactorPassword(),
    });

    if (error) {
      setTwoFactorStatus("error");
      setTwoFactorMessage("Two-factor authentication could not be turned off.");
      return;
    }

    setBackupCodes([]);
    setTwoFactorPassword("");
    setTwoFactorStatus("success");
    setTwoFactorMessage("Two-factor authentication is turned off.");
  };

  const copyBackupCodes = async () => {
    await navigator.clipboard.writeText(backupCodes().join("\n"));
    setTwoFactorStatus("success");
    setTwoFactorMessage("Recovery codes copied.");
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
            <aside class={styles.sidebar}>
              <A href="/" class={styles.backLink}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M19 12H5M11 18l-6-6 6-6" />
                </svg>
                Back to store
              </A>

              <div class={styles.identity}>
                <span class={styles.avatar}>
                  <Show when={profileImage()} fallback={initials() || "?"}>
                    {image => <img src={image()} alt="" />}
                  </Show>
                </span>
                <div>
                  <strong>{data().user.name}</strong>
                  <span>{data().user.email}</span>
                </div>
              </div>

              <nav class={styles.navigation} aria-label="Account sections">
                <For each={NAV_ITEMS}>
                  {item => (
                    <button
                      type="button"
                      class={styles.navItem}
                      classList={{
                        [styles.navItemActive]: activeSection() === item.id,
                      }}
                      aria-current={
                        activeSection() === item.id ? "page" : undefined
                      }
                      onClick={() => setActiveSection(item.id)}
                    >
                      {item.label}
                    </button>
                  )}
                </For>
              </nav>

              <div class={styles.sidebarFooter}>
                <span>Member since {formatDate(data().user.createdAt)}</span>
                <button type="button" class={styles.signOut} onClick={signOut}>
                  Sign out
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    aria-hidden="true"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="m16 17 5-5-5-5M21 12H9" />
                  </svg>
                </button>
              </div>
            </aside>

            <section class={styles.workspace}>
              <header class={styles.sectionHeader}>
                <div>
                  <span class={styles.welcome}>
                    Welcome back, {data().user.name.split(" ")[0]}
                  </span>
                  <h1>{SECTION_COPY[activeSection()].title}</h1>
                  <p>{SECTION_COPY[activeSection()].description}</p>
                </div>
                <div class={styles.headerActions}>
                  <Show when={overview.loading}>
                    <span class={styles.syncing}>Syncing</span>
                  </Show>
                  <A href="/products">Browse shop</A>
                </div>
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
                    <div class={styles.addressLayout}>
                      <form
                        class={`${styles.settingsPanel} ${styles.addressEditor}`}
                        onSubmit={saveAddress}
                      >
                        <div class={styles.settingsTitle}>
                          <span>Default delivery address</span>
                          <h3>
                            {overview()?.hasSavedAddress
                              ? "Edit your address"
                              : "Add your address"}
                          </h3>
                        </div>

                        <div class={styles.addressFieldRow}>
                          <label class={styles.field}>
                            <span>First name</span>
                            <input
                              value={addressFirstName()}
                              autocomplete="given-name"
                              maxlength="80"
                              required
                              onInput={event =>
                                setAddressFirstName(event.currentTarget.value)
                              }
                            />
                          </label>
                          <label class={styles.field}>
                            <span>Last name</span>
                            <input
                              value={addressLastName()}
                              autocomplete="family-name"
                              maxlength="80"
                              required
                              onInput={event =>
                                setAddressLastName(event.currentTarget.value)
                              }
                            />
                          </label>
                        </div>

                        <label class={styles.field}>
                          <span>Street and house number</span>
                          <input
                            value={addressStreet()}
                            autocomplete="street-address"
                            maxlength="160"
                            required
                            placeholder="Example Street 24"
                            onInput={event =>
                              setAddressStreet(event.currentTarget.value)
                            }
                          />
                        </label>

                        <div class={styles.addressFieldRow}>
                          <label class={styles.field}>
                            <span>Postal code</span>
                            <input
                              value={addressPostalCode()}
                              autocomplete="postal-code"
                              maxlength="24"
                              required
                              placeholder="1234 AB"
                              onInput={event =>
                                setAddressPostalCode(event.currentTarget.value)
                              }
                            />
                          </label>
                          <label class={styles.field}>
                            <span>City</span>
                            <input
                              value={addressCity()}
                              autocomplete="address-level2"
                              maxlength="80"
                              required
                              onInput={event =>
                                setAddressCity(event.currentTarget.value)
                              }
                            />
                          </label>
                        </div>

                        <label class={styles.field}>
                          <span>Country</span>
                          <input
                            value={addressCountry()}
                            autocomplete="country-name"
                            maxlength="80"
                            required
                            onInput={event =>
                              setAddressCountry(event.currentTarget.value)
                            }
                          />
                        </label>

                        <Show when={addressMessage()}>
                          <p
                            class={styles.formMessage}
                            classList={{
                              [styles.formError]:
                                addressStatus() === "error",
                            }}
                            role={
                              addressStatus() === "error" ? "alert" : "status"
                            }
                          >
                            {addressMessage()}
                          </p>
                        </Show>

                        <button
                          class={styles.primaryAction}
                          disabled={addressStatus() === "saving"}
                        >
                          {addressStatus() === "saving"
                            ? "Saving address"
                            : "Save address"}
                        </button>
                      </form>

                      <article
                        class={`${styles.addressCard} ${styles.addressPreview}`}
                      >
                        <div class={styles.addressTop}>
                          <span>Checkout preview</span>
                          <strong>
                            {overview()?.hasSavedAddress ? "Saved" : "New"}
                          </strong>
                        </div>
                        <address>
                          <strong>
                            {[addressFirstName(), addressLastName()]
                              .filter(Boolean)
                              .join(" ") || "Your name"}
                          </strong>
                          <span>
                            {addressStreet() || "Street and house number"}
                          </span>
                          <span>
                            {[addressPostalCode(), addressCity()]
                              .filter(Boolean)
                              .join(" ") || "Postal code and city"}
                          </span>
                          <span>{addressCountry() || "Country"}</span>
                        </address>
                        <p>
                          This address is filled in automatically when you
                          check out while signed in.
                        </p>
                        <A href="/checkout">Open checkout</A>
                      </article>
                    </div>
                  </Match>

                  <Match when={activeSection() === "payments"}>
                    <div class={styles.paymentLayout}>
                      <section class={styles.paymentHistory}>
                        <div class={styles.panelHead}>
                          <div>
                            <span>Payment activity</span>
                            <h3>Recent payments</h3>
                          </div>
                        </div>

                        <Show
                          when={overview()?.payments.length}
                          fallback={
                            <div class={styles.compactEmpty}>
                              <strong>No payments yet</strong>
                              <span>
                                Payment activity appears after you start an order.
                              </span>
                              <A href="/products">Browse the shop</A>
                            </div>
                          }
                        >
                          <div class={styles.paymentRows}>
                            <For each={overview()?.payments}>
                              {payment => (
                                <article class={styles.paymentRow}>
                                  <div class={styles.paymentMethod}>
                                    <span aria-hidden="true">
                                      {payment.method?.toLowerCase() === "ideal"
                                        ? "iD"
                                        : "M"}
                                    </span>
                                    <div>
                                      <strong>
                                        {readablePaymentMethod(payment.method)}
                                      </strong>
                                      <small>{payment.orderNumber}</small>
                                    </div>
                                  </div>
                                  <div class={styles.paymentMeta}>
                                    <span class={styles.status}>
                                      {readableStatus(payment.status)}
                                    </span>
                                    <small>{formatDate(payment.createdAt)}</small>
                                  </div>
                                  <strong>
                                    {formatMoney(payment.amountCents)}
                                  </strong>
                                </article>
                              )}
                            </For>
                          </div>
                        </Show>
                      </section>

                      <aside class={styles.paymentSafety}>
                        <div class={styles.paymentShield} aria-hidden="true">
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                          >
                            <path d="M12 3 5.5 5.7v5.6c0 4.1 2.6 7.8 6.5 9.7 3.9-1.9 6.5-5.6 6.5-9.7V5.7L12 3Z" />
                            <path d="m9.2 12.1 1.8 1.8 3.9-4" />
                          </svg>
                        </div>
                        <h3>Payment details stay with Mollie</h3>
                        <p>
                          Card and bank credentials are entered on Mollie’s
                          secure checkout. TCGHaven stores the payment status
                          and order reference, never the raw credentials.
                        </p>
                        <A href="/products">Start a secure checkout</A>
                      </aside>
                    </div>
                  </Match>

                  <Match when={activeSection() === "profile"}>
                    <div class={styles.settingsGrid}>
                      <form class={styles.settingsPanel} onSubmit={saveProfile}>
                        <div class={styles.settingsTitle}>
                          <span>Personal information</span>
                          <h3>Your details</h3>
                        </div>

                        <div class={styles.profileImageEditor}>
                          <div class={styles.profileImagePreview}>
                            <Show
                              when={profileImage()}
                              fallback={<span>{initials() || "?"}</span>}
                            >
                              {image => <img src={image()} alt="" />}
                            </Show>
                          </div>
                          <div class={styles.profileImageDetails}>
                            <strong>Profile image</strong>
                            <span>JPG, PNG, or WebP. Maximum 5 MB.</span>
                            <div class={styles.profileImageActions}>
                              <label>
                                Choose image
                                <input
                                  type="file"
                                  accept={PROFILE_IMAGE_ACCEPTED_TYPES.join(",")}
                                  disabled={profileStatus() === "saving"}
                                  onChange={selectProfileImage}
                                />
                              </label>
                              <Show when={profileImage()}>
                                <button
                                  type="button"
                                  disabled={profileStatus() === "saving"}
                                  onClick={removeProfileImage}
                                >
                                  Remove
                                </button>
                              </Show>
                            </div>
                          </div>
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

                      <form
                        class={styles.settingsPanel}
                        onSubmit={requestEmailChange}
                      >
                        <div class={styles.settingsTitle}>
                          <span>Login email</span>
                          <h3>Change email address</h3>
                        </div>
                        <div class={styles.verificationState}>
                          <span classList={{ [styles.verified]: data().user.emailVerified }}>
                            {data().user.emailVerified ? "Verified" : "Verification needed"}
                          </span>
                          <p>
                            {data().user.emailVerified
                              ? `Your current login email is ${data().user.email}.`
                              : "Verify your email to keep account recovery and order updates secure."}
                          </p>
                        </div>

                        <label class={styles.field}>
                          <span>New email address</span>
                          <input
                            value={newEmail()}
                            type="email"
                            maxlength="254"
                            autocomplete="email"
                            required
                            disabled={emailStatus() === "saving"}
                            onInput={event => setNewEmail(event.currentTarget.value)}
                          />
                          <small>
                            The address changes only after you open its verification link.
                          </small>
                        </label>

                        <Show when={emailMessage()}>
                          <p
                            class={styles.formMessage}
                            classList={{ [styles.formError]: emailStatus() === "error" }}
                            role={emailStatus() === "error" ? "alert" : "status"}
                          >
                            {emailMessage()}
                          </p>
                        </Show>

                        <div class={styles.emailActions}>
                          <Show when={!data().user.emailVerified}>
                            <button
                              type="button"
                              class={styles.secondaryAction}
                              disabled={
                                profileStatus() === "saving" ||
                                emailStatus() === "saving"
                              }
                              onClick={resendVerification}
                            >
                              Resend current verification
                            </button>
                          </Show>

                          <button
                            class={styles.primaryAction}
                            disabled={emailStatus() === "saving"}
                          >
                            {emailStatus() === "saving"
                              ? "Sending verification"
                              : "Verify new email"}
                          </button>
                        </div>
                      </form>
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

                    <section class={styles.twoFactorPanel}>
                      <div class={styles.twoFactorIntro}>
                        <div>
                          <span>Authenticator app</span>
                          <h3>Two-factor authentication</h3>
                        </div>
                        <span
                          class={styles.securityStatus}
                          classList={{
                            [styles.securityStatusActive]:
                              Boolean(data().user.twoFactorEnabled),
                          }}
                        >
                          {data().user.twoFactorEnabled ? "Active" : "Not active"}
                        </span>
                      </div>

                      <Show
                        when={data().user.twoFactorEnabled}
                        fallback={
                          <Show
                            when={twoFactorQr()}
                            fallback={
                              <form
                                class={styles.twoFactorStart}
                                onSubmit={beginTwoFactor}
                              >
                                <p>
                                  Add a second check at sign in using Google
                                  Authenticator, 1Password, Authy, or another
                                  TOTP app.
                                </p>
                                <label class={styles.field}>
                                  <span>Current password</span>
                                  <input
                                    type="password"
                                    value={twoFactorPassword()}
                                    autocomplete="current-password"
                                    required
                                    onInput={event =>
                                      setTwoFactorPassword(
                                        event.currentTarget.value,
                                      )
                                    }
                                  />
                                </label>
                                <button
                                  class={styles.primaryAction}
                                  disabled={twoFactorStatus() === "saving"}
                                >
                                  {twoFactorStatus() === "saving"
                                    ? "Preparing setup"
                                    : "Set up authenticator"}
                                </button>
                              </form>
                            }
                          >
                            <div class={styles.authenticatorSetup}>
                              <div class={styles.qrFrame}>
                                <img
                                  src={twoFactorQr()}
                                  alt="Authenticator setup QR code"
                                />
                              </div>
                              <form onSubmit={confirmTwoFactor}>
                                <p>
                                  Scan this code in your authenticator app, then
                                  enter its current code.
                                </p>
                                <label class={styles.field}>
                                  <span>Six-digit code</span>
                                  <input
                                    type="text"
                                    inputmode="numeric"
                                    autocomplete="one-time-code"
                                    maxlength="6"
                                    placeholder="000000"
                                    value={twoFactorCode()}
                                    required
                                    onInput={event =>
                                      setTwoFactorCode(event.currentTarget.value)
                                    }
                                  />
                                </label>
                                <button
                                  class={styles.primaryAction}
                                  disabled={twoFactorStatus() === "saving"}
                                >
                                  {twoFactorStatus() === "saving"
                                    ? "Verifying code"
                                    : "Activate two-factor"}
                                </button>
                              </form>
                            </div>
                          </Show>
                        }
                      >
                        <form
                          class={styles.twoFactorManage}
                          onSubmit={regenerateBackupCodes}
                        >
                          <p>
                            Two-factor authentication is required after your
                            password on new or untrusted devices.
                          </p>
                          <label class={styles.field}>
                            <span>Current password</span>
                            <input
                              type="password"
                              value={twoFactorPassword()}
                              autocomplete="current-password"
                              required
                              onInput={event =>
                                setTwoFactorPassword(event.currentTarget.value)
                              }
                            />
                          </label>
                          <div class={styles.twoFactorActions}>
                            <button
                              class={styles.secondaryAction}
                              disabled={twoFactorStatus() === "saving"}
                            >
                              Create new recovery codes
                            </button>
                            <button
                              type="button"
                              class={styles.dangerAction}
                              disabled={twoFactorStatus() === "saving"}
                              onClick={disableTwoFactor}
                            >
                              Turn off two-factor
                            </button>
                          </div>
                        </form>
                      </Show>

                      <Show when={twoFactorMessage()}>
                        <p
                          class={styles.formMessage}
                          classList={{
                            [styles.formError]: twoFactorStatus() === "error",
                          }}
                          role={twoFactorStatus() === "error" ? "alert" : "status"}
                        >
                          {twoFactorMessage()}
                        </p>
                      </Show>

                      <Show
                        when={
                          data().user.twoFactorEnabled && backupCodes().length
                        }
                      >
                        <div class={styles.recoveryCodes}>
                          <div>
                            <h4>Recovery codes</h4>
                            <p>
                              Save these somewhere private. Each code works once.
                            </p>
                          </div>
                          <div class={styles.codeGrid}>
                            <For each={backupCodes()}>
                              {code => <code>{code}</code>}
                            </For>
                          </div>
                          <button
                            type="button"
                            class={styles.secondaryAction}
                            onClick={copyBackupCodes}
                          >
                            Copy recovery codes
                          </button>
                        </div>
                      </Show>
                    </section>
                  </Match>
                </Switch>
            </section>
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
