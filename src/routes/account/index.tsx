import { Title } from "@solidjs/meta";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
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
import { matchCountry } from "~/lib/countries";
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
import RouteSkeleton from "~/components/layout/RouteSkeleton";
import CountrySelect from "~/components/forms/CountrySelect";
import StoreCredit from "~/components/account/StoreCredit";
import styles from "./index.module.scss";

type Section =
  | "overview"
  | "orders"
  | "deliveries"
  | "wishlist"
  | "addresses"
  | "payments"
  | "credit"
  | "profile"
  | "security";

type AccountOrder = {
  id: string;
  orderNumber: string;
  status: string;
  currency: string;
  totalCents: number;
  creditAppliedCents?: number;
  createdAt: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
  items: OrderItem[];
};

type OrderItem = {
  name: string;
  quantity: number;
  slug?: string | null;
  image?: string | null;
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
  { id: "deliveries", label: "Deliveries" },
  { id: "wishlist", label: "Wishlist" },
  { id: "addresses", label: "Addresses" },
  { id: "payments", label: "Payments" },
  { id: "credit", label: "Store credit" },
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
];

const SECTION_COPY: Record<Section, { title: string; description: string }> = {
  credit: { title: "Store credit", description: "Your available balance and credit activity." },
  overview: {
    title: "Account overview",
    description: "A quick look at your collection activity.",
  },
  orders: {
    title: "Your orders",
    description: "Review purchases and follow their current status.",
  },
  deliveries: {
    title: "Deliveries",
    description: "Follow every parcel from our packing table to your door.",
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

const DELIVERY_STATUSES = new Set(["paid", "processing", "shipped", "completed"]);

function isDelivery(order: AccountOrder) {
  return DELIVERY_STATUSES.has(order.status);
}

function deliveryStage(status: string) {
  if (status === "completed") return 4;
  if (status === "shipped") return 3;
  if (status === "processing") return 2;
  return 1;
}

function deliveryMessage(order: AccountOrder) {
  if (order.status === "completed") return "Delivered and complete";
  if (order.status === "shipped") return "Your parcel is with PostNL";
  if (order.status === "processing") return "We are packing your order";
  return "Payment received, ready for packing";
}

const CLOSED_STATUSES = new Set(["cancelled", "canceled", "expired", "failed", "refunded"]);

function isClosed(order: AccountOrder) {
  return CLOSED_STATUSES.has(order.status);
}

// A playful collector rank from the number of orders that went through.
const RANKS = [
  { min: 0, name: "Common" },
  { min: 1, name: "Uncommon" },
  { min: 3, name: "Rare" },
  { min: 6, name: "Holo Rare" },
  { min: 12, name: "Secret Rare" },
];

function collectorRank(count: number) {
  let index = 0;
  RANKS.forEach((rank, position) => {
    if (count >= rank.min) index = position;
  });
  const current = RANKS[index]!;
  const next = RANKS[index + 1];
  return {
    name: current.name,
    index,
    next: next?.name ?? null,
    toNext: next ? next.min - count : 0,
    progress: next ? (count - current.min) / (next.min - current.min) : 1,
  };
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function itemSummary(order: AccountOrder) {
  if (!order.items.length) return "Order details";
  const [first, ...rest] = order.items;
  const firstLabel = first!.quantity > 1 ? `${first!.quantity} × ${first!.name}` : first!.name;
  return rest.length ? `${firstLabel} and ${rest.length} more` : firstLabel;
}

const DELIVERY_STEPS = ["Paid", "Packing", "With PostNL", "Delivered"];

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
  const [searchParams] = useSearchParams();
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
  const [orderFilter, setOrderFilter] = createSignal<"all" | "active" | "delivered" | "closed">("all");
  let profileInitialized = false;
  let addressInitialized = false;

  const [overview, { refetch: refetchOverview }] = createResource(
    () => session().data?.user.id,
    loadOverview,
  );

  createEffect(() => {
    const requestedSection = searchParams.section;
    if (
      typeof requestedSection === "string" &&
      NAV_ITEMS.some(item => item.id === requestedSection)
    ) {
      setActiveSection(requestedSection as Section);
    }
  });

  createEffect(() => {
    const currentUser = session().data?.user as
      | { role?: string }
      | undefined;
    if (!session().isPending && currentUser?.role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    // A temporary get-session failure must not be treated as a signed-out
    // response. Otherwise a customer with a valid cookie is bounced back to
    // login when the account service is briefly unavailable.
    if (!session().isPending && !session().error && !session().data) {
      const requestedSection = searchParams.section;
      const returnPath =
        typeof requestedSection === "string" &&
        NAV_ITEMS.some(item => item.id === requestedSection)
          ? `/account?section=${requestedSection}`
          : "/account";
      navigate(`/login?next=${encodeURIComponent(returnPath)}`, { replace: true });
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

  const deliveries = () => overview()?.orders.filter(isDelivery) ?? [];
  const activeDeliveries = () =>
    deliveries().filter(order => order.status !== "completed");
  const rank = () =>
    collectorRank(overview()?.orders.filter(order => !isClosed(order) && order.status !== "pending").length ?? 0);

  const ordersFor = (filter: "all" | "active" | "delivered" | "closed") => {
    const orders = overview()?.orders ?? [];
    switch (filter) {
      case "active":
        return orders.filter(order => !isClosed(order) && order.status !== "completed");
      case "delivered":
        return orders.filter(order => order.status === "completed");
      case "closed":
        return orders.filter(isClosed);
      default:
        return orders;
    }
  };
  const filteredOrders = () => ordersFor(orderFilter());
  const orderFilterCount = (filter: "all" | "active" | "delivered" | "closed") =>
    ordersFor(filter).length;

  // Light tilt and moving foil on the member card, mouse only.
  const tiltCard = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    if (event.pointerType !== "mouse") return;
    const card = event.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    card.style.setProperty("--rx", `${((0.5 - y) * 9).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
  };

  const resetCard = (event: PointerEvent & { currentTarget: HTMLElement }) => {
    for (const property of ["--mx", "--my", "--rx", "--ry"]) {
      event.currentTarget.style.removeProperty(property);
    }
  };

  const checklist = () => {
    const user = session().data?.user as { emailVerified?: boolean; twoFactorEnabled?: boolean } | undefined;
    return [
      {
        done: Boolean(user?.emailVerified),
        title: "Email verified",
        todo: "Verify your email",
        copy: user?.emailVerified ? "Order updates reach you." : "So order updates and recovery reach you.",
        action: "profile" as Section,
      },
      {
        done: Boolean(overview()?.hasSavedAddress),
        title: "Address saved",
        todo: "Save your address",
        copy: overview()?.hasSavedAddress ? "Checkout fills it in for you." : "Checkout will fill it in for you.",
        action: "addresses" as Section,
      },
      {
        done: Boolean(user?.twoFactorEnabled),
        title: "Two-factor on",
        todo: "Turn on two-factor",
        copy: user?.twoFactorEnabled ? "A second check protects sign-in." : "Add a second check at sign-in.",
        action: "security" as Section,
      },
    ];
  };

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
      country: matchCountry(addressCountry())?.name ?? addressCountry(),
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
    window.location.replace("/");
  };

  return (
    <main class={styles.page}>
      <Title>Your account | TCGHaven</Title>

      <Show
        when={
          !session().isPending &&
          session().data &&
          (session().data!.user as { role?: string }).role !== "admin"
            ? session().data
            : undefined
        }
        fallback={
          <Show
            when={!session().isPending && session().error}
            fallback={<RouteSkeleton variant="account" inline />}
          >
            <section class={styles.sessionError} role="alert">
              <p>Account connection</p>
              <h1>We could not load your session.</h1>
              <span>Your login has not been cleared. Try the connection again.</span>
              <div>
                <button type="button" onClick={() => void session().refetch()}>
                  Try again
                </button>
                <A href="/">Back to the shop</A>
              </div>
            </section>
          </Show>
        }
      >
        {data => (
          <div class={styles.account}>
            <aside class={styles.sidebar}>
              <A href="/" class={styles.brand} aria-label="TCG Haven home">
                <img src="/images/logo-mark.png" alt="" width="26" height="26" />
                <span>TCG Haven</span>
              </A>

              <div class={styles.identity}>
                <span class={styles.avatar}>
                  <Show when={profileImage()} fallback={initials() || "?"}>
                    {image => <img src={image()} alt="" />}
                  </Show>
                </span>
                <div>
                  <strong>{data().user.name}</strong>
                  <span class={styles.rankChip} data-rank={rank().index}>
                    {rank().name}
                  </span>
                </div>
              </div>

              <nav class={styles.navigation} aria-label="Account sections">
                <For each={NAV_ITEMS}>
                  {item => {
                    const count = () =>
                      item.id === "deliveries"
                        ? activeDeliveries().length
                        : item.id === "wishlist"
                          ? overview()?.wishlist.length ?? 0
                          : 0;
                    return (
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
                        <AccountNavIcon section={item.id} />
                        {item.label}
                        <Show when={count()}>
                          <span class={styles.navCount}>{count()}</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </nav>

              <div class={styles.sidebarFooter}>
                <span>Member since {formatDate(data().user.createdAt)}</span>
                <A href="/products" class={styles.backLink}>
                  <span class={styles.backIcon} aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 9.5 5.4 4.8A1 1 0 0 1 6.4 4h11.2a1 1 0 0 1 1 .8L20 9.5" />
                      <path d="M4 9.5a2.67 2.67 0 0 0 5.33 0 2.67 2.67 0 0 0 5.34 0 2.67 2.67 0 0 0 5.33 0" />
                      <path d="M5.5 12.2V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-6.8M10 20v-4.5h4V20" />
                    </svg>
                  </span>
                  <span class={styles.backText}>
                    <strong>Back to the shop</strong>
                    <small>Continue browsing</small>
                  </span>
                  <svg class={styles.backArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </A>
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
              <Show when={activeSection() !== "overview"}>
                <header class={styles.sectionHeader}>
                  <div>
                    <h1>{SECTION_COPY[activeSection()].title}</h1>
                    <p>{SECTION_COPY[activeSection()].description}</p>
                  </div>
                  <Show when={overview.loading}>
                    <span class={styles.syncing}>Syncing</span>
                  </Show>
                </header>
              </Show>

                <Show when={overview.error}>
                  <div class={styles.errorState} role="alert">
                    <strong>Account activity is temporarily unavailable.</strong>
                    <span>Your profile and security settings still work.</span>
                  </div>
                </Show>

                <Switch>
                  <Match when={activeSection() === "overview"}>
                    <div class={styles.view}>
                      <section class={styles.hero}>
                        <div class={styles.heroCopy}>
                          <span class={styles.heroEyebrow}>{greeting()}</span>
                          <h1>{data().user.name.split(" ")[0]}</h1>
                          <p>
                            <Show
                              when={activeDeliveries()[0]}
                              fallback={
                                overview()?.orders.length
                                  ? "Everything you ordered has arrived. Time to find the next one?"
                                  : "Your collection starts here. Save cards you like and they'll wait for you."
                              }
                            >
                              {order => (
                                <>
                                  Order <strong>{order().orderNumber}</strong>{" "}
                                  {order().status === "shipped"
                                    ? "is on its way with PostNL."
                                    : order().status === "processing"
                                      ? "is being packed right now."
                                      : "is paid and next in line for packing."}
                                </>
                              )}
                            </Show>
                          </p>

                          <div class={styles.rankProgress}>
                            <div>
                              <span>Collector rank</span>
                              <strong data-rank={rank().index}>{rank().name}</strong>
                            </div>
                            <span class={styles.rankBar}>
                              <span style={{ transform: `scaleX(${Math.max(0.04, rank().progress)})` }} />
                            </span>
                            <small>
                              {rank().next
                                ? `${rank().toNext} more ${rank().toNext === 1 ? "order" : "orders"} to ${rank().next}`
                                : "The rarest rank there is"}
                            </small>
                          </div>
                        </div>

                        <div
                          class={styles.memberCard}
                          data-rank={rank().index}
                          onPointerMove={tiltCard}
                          onPointerLeave={resetCard}
                        >
                          <span class={styles.memberFoil} aria-hidden="true" />
                          <div class={styles.memberTop}>
                            <span class={styles.memberBrand}>
                              <img src="/images/logo-mark.png" alt="" width="22" height="22" />
                              TCG Haven
                            </span>
                            <span class={styles.memberRank}>{rank().name}</span>
                          </div>
                          <div class={styles.memberWho}>
                            <span class={styles.memberAvatar}>
                              <Show when={profileImage()} fallback={initials() || "?"}>
                                {image => <img src={image()} alt="" />}
                              </Show>
                            </span>
                            <div>
                              <strong>{data().user.name}</strong>
                              <span>Collector since {new Date(data().user.createdAt).getFullYear()}</span>
                            </div>
                          </div>
                          <dl class={styles.memberStats}>
                            <div>
                              <dt>Orders</dt>
                              <dd>{overview()?.orders.length ?? 0}</dd>
                            </div>
                            <div>
                              <dt>Saved</dt>
                              <dd>{overview()?.wishlist.length ?? 0}</dd>
                            </div>
                            <div>
                              <dt>Spent</dt>
                              <dd>{formatMoney(totalSpent())}</dd>
                            </div>
                          </dl>
                          <span class={styles.memberNumber} aria-hidden="true">
                            No. {data().user.id.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase()}
                          </span>
                        </div>
                      </section>

                      <Show when={activeDeliveries()[0]}>
                        {order => (
                          <section class={styles.onTheWay}>
                            <ItemThumbs items={order().items} large />
                            <div class={styles.onTheWayBody}>
                              <div class={styles.onTheWayHead}>
                                <div>
                                  <span>On its way</span>
                                  <h2>{deliveryMessage(order())}</h2>
                                  <p>
                                    {order().orderNumber} · {itemSummary(order())}
                                  </p>
                                </div>
                                <div class={styles.onTheWayActions}>
                                  <Show when={order().trackingUrl}>
                                    {trackingUrl => (
                                      <a href={trackingUrl()} target="_blank" rel="noopener noreferrer" class={styles.trackButton}>
                                        Track parcel
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                          <path d="M7 17 17 7M8 7h9v9" />
                                        </svg>
                                      </a>
                                    )}
                                  </Show>
                                  <button type="button" class={styles.ghostButton} onClick={() => setActiveSection("deliveries")}>
                                    {activeDeliveries().length > 1
                                      ? `All ${activeDeliveries().length} deliveries`
                                      : "Details"}
                                  </button>
                                </div>
                              </div>
                              <DeliveryTrack stage={deliveryStage(order().status)} />
                            </div>
                          </section>
                        )}
                      </Show>

                      <div class={styles.overviewGrid}>
                        <section class={styles.panel}>
                          <div class={styles.panelHead}>
                            <h3>Recent orders</h3>
                            <Show when={overview()?.orders.length}>
                              <button type="button" onClick={() => setActiveSection("orders")}>
                                See all {overview()?.orders.length}
                              </button>
                            </Show>
                          </div>

                          <Show
                            when={overview()?.orders.length}
                            fallback={
                              <div class={styles.compactEmpty}>
                                <strong>No orders yet</strong>
                                <span>Your first order will show up here, with its parcel tracking.</span>
                                <A href="/products">Explore the shop</A>
                              </div>
                            }
                          >
                            <div class={styles.recentOrders}>
                              <For each={overview()?.orders.slice(0, 4)}>
                                {order => (
                                  <button type="button" class={styles.recentOrder} onClick={() => setActiveSection("orders")}>
                                    <ItemThumbs items={order.items} />
                                    <span class={styles.recentText}>
                                      <strong>{itemSummary(order)}</strong>
                                      <small>
                                        {order.orderNumber} · {formatDate(order.createdAt)}
                                      </small>
                                    </span>
                                    <span class={styles.status} data-status={order.status}>
                                      {readableStatus(order.status)}
                                    </span>
                                    <strong class={styles.recentTotal}>
                                      {formatMoney(order.totalCents, order.currency)}
                                    </strong>
                                  </button>
                                )}
                              </For>
                            </div>
                          </Show>
                        </section>

                        <section class={`${styles.panel} ${styles.wishPanel}`}>
                          <div class={styles.panelHead}>
                            <h3>Wishlist</h3>
                            <Show when={overview()?.wishlist.length}>
                              <button type="button" onClick={() => setActiveSection("wishlist")}>
                                Open
                              </button>
                            </Show>
                          </div>
                          <Show
                            when={overview()?.wishlist.length}
                            fallback={
                              <div class={styles.compactEmpty}>
                                <strong>Nothing saved yet</strong>
                                <span>Tap the heart on any product to keep it here.</span>
                                <A href="/products">Find something</A>
                              </div>
                            }
                          >
                            <button type="button" class={styles.fan} onClick={() => setActiveSection("wishlist")} aria-label="Open your wishlist">
                              <For each={overview()?.wishlist.slice(0, 5)}>
                                {(item, index) => {
                                  const count = Math.min(5, overview()?.wishlist.length ?? 1);
                                  const offset = index() - (count - 1) / 2;
                                  return (
                                    <span
                                      class={styles.fanCard}
                                      style={{
                                        "--x": `${offset * 3.1}rem`,
                                        "--y": `${Math.abs(offset) * 0.55}rem`,
                                        "--r": `${offset * 7}deg`,
                                        "z-index": String(10 - Math.abs(Math.round(offset))),
                                      }}
                                    >
                                      <img src={item.image ?? "/images/logo-mark.png"} alt="" loading="lazy" />
                                    </span>
                                  );
                                }}
                              </For>
                            </button>
                            <p class={styles.fanCaption}>
                              <strong>{overview()?.wishlist[0]?.name}</strong>
                              <span>
                                {(overview()?.wishlist.length ?? 0) > 1
                                  ? `and ${(overview()?.wishlist.length ?? 1) - 1} more saved`
                                  : "saved for later"}
                              </span>
                            </p>
                          </Show>
                        </section>
                      </div>

                      <section class={styles.checklist}>
                        <div class={styles.checklistHead}>
                          <div>
                            <h3>Your account</h3>
                            <p>
                              {checklist().filter(item => item.done).length === 3
                                ? "All set. Nice and safe."
                                : `${checklist().filter(item => item.done).length} of 3 done`}
                            </p>
                          </div>
                          <span
                            class={styles.checkRing}
                            style={{ "--done": String(checklist().filter(item => item.done).length / 3) }}
                            aria-hidden="true"
                          >
                            {checklist().filter(item => item.done).length}/3
                          </span>
                        </div>
                        <div class={styles.checkItems}>
                          <For each={checklist()}>
                            {item => (
                              <button
                                type="button"
                                class={styles.checkItem}
                                classList={{ [styles.checkItemDone]: item.done }}
                                onClick={() => setActiveSection(item.action)}
                              >
                                <span class={styles.checkMark} aria-hidden="true">
                                  <Show when={item.done} fallback={<span />}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                                  </Show>
                                </span>
                                <span class={styles.checkText}>
                                  <strong>{item.done ? item.title : item.todo}</strong>
                                  <small>{item.copy}</small>
                                </span>
                                <svg class={styles.checkArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
                              </button>
                            )}
                          </For>
                        </div>
                      </section>
                    </div>
                  </Match>

                  <Match when={activeSection() === "orders"}>
                    <Show
                      when={overview()?.orders.length}
                      fallback={
                        <EmptyState
                          kind="orders"
                          title="No orders yet"
                          copy="Your purchases will appear here with their payment and delivery status."
                          action="Start shopping"
                          href="/products"
                        />
                      }
                    >
                      <div class={styles.view}>
                        <div class={styles.filters} role="group" aria-label="Filter orders">
                          <For
                            each={[
                              { id: "all", label: "All" },
                              { id: "active", label: "On the way" },
                              { id: "delivered", label: "Delivered" },
                              { id: "closed", label: "Cancelled" },
                            ] as const}
                          >
                            {filter => (
                              <Show when={filter.id === "all" || orderFilterCount(filter.id)}>
                                <button
                                  type="button"
                                  class={styles.filter}
                                  classList={{ [styles.filterActive]: orderFilter() === filter.id }}
                                  aria-pressed={orderFilter() === filter.id}
                                  onClick={() => setOrderFilter(filter.id)}
                                >
                                  {filter.label}
                                  <span>{orderFilterCount(filter.id)}</span>
                                </button>
                              </Show>
                            )}
                          </For>
                        </div>

                        <div class={styles.orderList}>
                          <For
                            each={filteredOrders()}
                            fallback={<p class={styles.filterEmpty}>No orders here.</p>}
                          >
                            {order => (
                              <article class={styles.orderCard} classList={{ [styles.orderClosed]: isClosed(order) }}>
                                <header class={styles.orderHead}>
                                  <div>
                                    <strong>{order.orderNumber}</strong>
                                    <span>Placed {formatDate(order.createdAt)}</span>
                                  </div>
                                  <span class={styles.status} data-status={order.status}>
                                    {readableStatus(order.status)}
                                  </span>
                                  <strong class={styles.orderTotal}>
                                    {formatMoney(order.totalCents, order.currency)}
                                  </strong>
                                </header>

                                <Show when={order.creditAppliedCents}>
                                  <p>Store credit: {formatMoney(order.creditAppliedCents!, order.currency)} · Mollie payment: {formatMoney(order.totalCents - order.creditAppliedCents!, order.currency)}</p>
                                </Show>
                                <ul class={styles.orderItems}>
                                  <For each={order.items}>
                                    {item => (
                                      <li>
                                        <A
                                          href={item.slug ? `/products/${item.slug}` : "/products"}
                                          class={styles.orderItem}
                                        >
                                          <span class={styles.orderItemImage}>
                                            <img
                                              src={item.image ?? "/images/logo-mark.png"}
                                              alt=""
                                              loading="lazy"
                                              classList={{ [styles.imageFallback]: !item.image }}
                                            />
                                          </span>
                                          <span class={styles.orderItemName}>{item.name}</span>
                                          <Show when={item.quantity > 1}>
                                            <span class={styles.orderItemQty}>× {item.quantity}</span>
                                          </Show>
                                        </A>
                                      </li>
                                    )}
                                  </For>
                                </ul>

                                <footer class={styles.orderFoot}>
                                  <Show
                                    when={isDelivery(order)}
                                    fallback={
                                      <span class={styles.orderNote}>
                                        {isClosed(order)
                                          ? "This order was not completed. You were not charged for it."
                                          : "Waiting for payment."}
                                      </span>
                                    }
                                  >
                                    <DeliveryTrack stage={deliveryStage(order.status)} compact />
                                  </Show>
                                  <div class={styles.orderActions}>
                                    <Show when={order.trackingUrl}>
                                      {trackingUrl => (
                                        <a href={trackingUrl()} target="_blank" rel="noopener noreferrer" class={styles.trackButton}>
                                          Track package
                                        </a>
                                      )}
                                    </Show>
                                    <Show when={!isClosed(order)}>
                                      <A href={`/returns?order=${encodeURIComponent(order.orderNumber)}`} class={styles.ghostButton}>
                                        Cancel or return
                                      </A>
                                    </Show>
                                  </div>
                                </footer>
                              </article>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </Match>

                  <Match when={activeSection() === "deliveries"}>
                    <Show
                      when={deliveries().length}
                      fallback={
                        <EmptyState
                          kind="deliveries"
                          title="No deliveries yet"
                          copy="Paid orders appear here as soon as we start preparing them."
                          action="Browse the shop"
                          href="/products"
                        />
                      }
                    >
                      <div class={`${styles.view} ${styles.deliveryList}`}>
                        <For each={deliveries()}>
                          {order => (
                            <article
                              class={styles.deliveryCard}
                              classList={{ [styles.deliveryPast]: order.status === "completed" }}
                            >
                              <header class={styles.deliveryHeader}>
                                <ItemThumbs items={order.items} large />
                                <div>
                                  <span>
                                    {order.status === "completed" ? "Delivered" : "On its way"}
                                  </span>
                                  <h2>{deliveryMessage(order)}</h2>
                                  <p>
                                    {order.orderNumber} · placed {formatDate(order.createdAt)}
                                  </p>
                                </div>
                              </header>

                              <DeliveryTrack stage={deliveryStage(order.status)} />

                              <dl class={styles.deliveryDetails}>
                                <div>
                                  <dt>Inside</dt>
                                  <dd>
                                    {order.items.length
                                      ? order.items.map(item => `${item.quantity} × ${item.name}`).join(", ")
                                      : "Order details will appear here"}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Handed to PostNL</dt>
                                  <dd>{order.shippedAt ? formatDate(order.shippedAt) : "Not yet"}</dd>
                                </div>
                                <div>
                                  <dt>Tracking code</dt>
                                  <dd class={styles.mono}>{order.trackingNumber ?? "After dispatch"}</dd>
                                </div>
                              </dl>

                              <footer class={styles.deliveryFooter}>
                                <p>
                                  {order.trackingUrl
                                    ? "PostNL has the latest scan and delivery estimate."
                                    : order.status === "completed"
                                      ? "This delivery has been completed."
                                      : "We'll add your PostNL link as soon as the parcel leaves us."}
                                </p>
                                <Show when={order.trackingUrl}>
                                  {trackingUrl => (
                                    <a href={trackingUrl()} target="_blank" rel="noopener noreferrer" class={styles.trackButton}>
                                      Track with PostNL
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                        <path d="M7 17 17 7M8 7h9v9" />
                                      </svg>
                                    </a>
                                  )}
                                </Show>
                              </footer>
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
                          kind="wishlist"
                          title="Nothing saved yet"
                          copy="Save cards and sealed products you want to revisit."
                          action="Browse the collection"
                          href="/products"
                        />
                      }
                    >
                      {/* A binder page: every saved product sits in its own sleeve. */}
                      <div class={`${styles.view} ${styles.binder}`}>
                        <For each={overview()?.wishlist}>
                          {item => (
                            <A href={`/products/${item.slug}`} class={styles.pocket}>
                              <span class={styles.sleeve}>
                                <img src={item.image ?? "/images/logo-mark.png"} alt="" loading="lazy" />
                              </span>
                              <span class={styles.pocketText}>
                                <small>{item.game ?? "TCG"}</small>
                                <strong>{item.name}</strong>
                              </span>
                            </A>
                          )}
                        </For>
                        <For each={Array.from({ length: (4 - ((overview()?.wishlist.length ?? 0) % 4)) % 4 })}>
                          {() => (
                            <A href="/products" class={`${styles.pocket} ${styles.pocketEmpty}`} aria-label="Find more to save">
                              <span class={styles.sleeve}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>
                              </span>
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

                        <CountrySelect value={addressCountry()} onChange={setAddressCountry} />

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

                  <Match when={activeSection() === "credit"}><StoreCredit /></Match>
                  <Match when={activeSection() === "payments"}>
                    <div class={styles.paymentLayout}>
                      <section class={styles.paymentHistory}>
                        <div class={styles.panelHead}>
                          <div>
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
                                    <span class={styles.status} data-status={payment.status}>
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
                                  Add a second check at sign in using 1Password,
                                  Authy, or another TOTP app. After setup, you
                                  can also request a
                                  one-time code through your verified email.
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

// Up to three product photos, overlapping like a small stack of cards.
function ItemThumbs(props: { items: OrderItem[]; large?: boolean }) {
  const shown = () => (props.items.length ? props.items.slice(0, 3) : [{ name: "", quantity: 1 }]);
  const extra = () => props.items.length - 3;
  return (
    <span class={styles.thumbs} classList={{ [styles.thumbsLarge]: props.large }} aria-hidden="true">
      <For each={shown()}>
        {item => (
          <span class={styles.thumb}>
            <img
              src={item.image ?? "/images/logo-mark.png"}
              alt=""
              loading="lazy"
              classList={{ [styles.imageFallback]: !item.image }}
            />
          </span>
        )}
      </For>
      <Show when={extra() > 0}>
        <span class={`${styles.thumb} ${styles.thumbMore}`}>+{extra()}</span>
      </Show>
    </span>
  );
}

// Paid, packing, with PostNL, delivered: the filled line is how far it got.
function DeliveryTrack(props: { stage: number; compact?: boolean }) {
  return (
    <ol
      class={styles.track}
      classList={{ [styles.trackCompact]: props.compact }}
      style={{ "--progress": String((props.stage - 1) / (DELIVERY_STEPS.length - 1)) }}
      aria-label="Delivery progress"
    >
      <For each={DELIVERY_STEPS}>
        {(label, index) => {
          const step = () => index() + 1;
          return (
            <li
              classList={{
                [styles.trackDone]: step() < props.stage || props.stage === DELIVERY_STEPS.length,
                [styles.trackNow]: step() === props.stage && props.stage < DELIVERY_STEPS.length,
              }}
              aria-current={step() === props.stage ? "step" : undefined}
            >
              <span class={styles.trackDot} aria-hidden="true">
                <Show when={step() < props.stage || props.stage === DELIVERY_STEPS.length}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                </Show>
              </span>
              <strong>{label}</strong>
            </li>
          );
        }}
      </For>
    </ol>
  );
}

function EmptyState(props: {
  kind: "orders" | "deliveries" | "wishlist";
  title: string;
  copy: string;
  action: string;
  href: string;
}) {
  return (
    <div class={styles.emptyState}>
      <span class={styles.emptyIcon} aria-hidden="true">
        <Switch>
          <Match when={props.kind === "orders"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
            </svg>
          </Match>
          <Match when={props.kind === "deliveries"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" />
              <circle cx="7" cy="18" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
          </Match>
          <Match when={props.kind === "wishlist"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20s-7.5-4.6-10-9.3C.4 7.1 2 3.5 5.6 3A5 5 0 0 1 12 5.2 5 5 0 0 1 18.4 3c3.6.5 5.2 4.1 3.6 7.7C19.5 15.4 12 20 12 20Z" />
            </svg>
          </Match>
        </Switch>
      </span>
      <h3>{props.title}</h3>
      <p>{props.copy}</p>
      <A href={props.href}>{props.action}</A>
    </div>
  );
}

function AccountNavIcon(props: { section: Section }) {
  return (
    <svg class={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <Switch>
        <Match when={props.section === "overview"}>
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5Z" />
          <path d="M13 5.5A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5ZM4 14.5A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5ZM13 14.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5Z" />
        </Match>
        <Match when={props.section === "orders"}>
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" />
        </Match>
        <Match when={props.section === "deliveries"}>
          <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
        </Match>
        <Match when={props.section === "wishlist"}>
          <path d="M12 20s-7.5-4.6-10-9.3C.4 7.1 2 3.5 5.6 3A5 5 0 0 1 12 5.2 5 5 0 0 1 18.4 3c3.6.5 5.2 4.1 3.6 7.7C19.5 15.4 12 20 12 20Z" />
        </Match>
        <Match when={props.section === "addresses"}>
          <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" />
        </Match>
        <Match when={props.section === "credit"}>
          <rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18M16 13h5v4h-5z" />
        </Match>
        <Match when={props.section === "payments"}>
          <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" />
        </Match>
        <Match when={props.section === "profile"}>
          <circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" />
        </Match>
        <Match when={props.section === "security"}>
          <path d="M12 3 5.5 5.7v5.6c0 4.1 2.6 7.8 6.5 9.7 3.9-1.9 6.5-5.6 6.5-9.7V5.7Z" /><path d="m9.2 12.1 1.8 1.8 3.9-4" />
        </Match>
      </Switch>
    </svg>
  );
}
