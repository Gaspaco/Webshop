import type { StoreProfile } from "~/lib/store-profile";
import type {
  ReadinessConfirmationId,
  ReadinessConfirmations,
} from "~/lib/readiness-confirmations";

export type LaunchReadinessItem = {
  id: string;
  category: "commerce" | "operations" | "legal" | "growth";
  label: string;
  detail: string;
  responsible: "developer" | "owner" | "joint";
  configured: boolean;
  blocking: boolean;
  confirmationId?: ReadinessConfirmationId;
  manuallyConfirmed?: boolean;
};

const present = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));

export function getLaunchReadiness(input: {
  unconvertedStarterProducts: number;
  storeProfile: StoreProfile;
  activeProducts: number;
  paidPayments: number;
  trackedOrders: number;
  embeddedImageCount: number;
  confirmations?: ReadinessConfirmations;
}) {
  const mollieKey = process.env.MOLLIE_API_KEY?.trim() ?? "";
  const mollieLive = mollieKey.startsWith("live_");
  const mollieTest = mollieKey.startsWith("test_");
  const emailConfigured = present(
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "AUTH_EMAIL_FROM",
  );
  const postnlCredentials = present(
    "POSTNL_API_KEY",
    "POSTNL_CUSTOMER_NUMBER",
    "POSTNL_CUSTOMER_CODE",
    "POSTNL_COLLECTION_LOCATION",
  );
  const postnlProduction =
    postnlCredentials && process.env.POSTNL_MODE?.trim() === "production";
  const durableImageStorage =
    present("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") ||
    present("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET");
  const manuallyConfirmed = (id: ReadinessConfirmationId) =>
    Boolean(input.confirmations?.[id]);
  const items: LaunchReadinessItem[] = [
    {
      id: "database",
      category: "commerce",
      label: "PostgreSQL connection",
      detail: "The live dashboard query succeeded against PostgreSQL.",
      responsible: "developer",
      configured: true,
      blocking: true,
    },
    {
      id: "mollie-live",
      category: "commerce",
      label: "Mollie live payments",
      detail: mollieLive && input.paidPayments > 0
        ? `${input.paidPayments} paid ${input.paidPayments === 1 ? "payment has" : "payments have"} been recorded through the live checkout.`
        : mollieLive
          ? "Mollie live mode is configured. Complete one controlled payment to verify the full webhook flow."
        : mollieTest
          ? "Mollie test mode is connected. Add the live API key to the production environment before accepting real orders."
          : "Add a Mollie API key before creating checkout payments.",
      responsible: "owner",
      configured: mollieLive,
      blocking: true,
    },
    {
      id: "inventory",
      category: "commerce",
      label: "Transactional stock reservation",
      detail: input.paidPayments > 0
        ? "Managed stock reservation and payment-webhook settlement are active on real orders."
        : "Managed variants are reserved at checkout and committed by the payment webhook.",
      responsible: "developer",
      configured: true,
      blocking: true,
    },
    {
      id: "catalogue",
      category: "commerce",
      label: "Managed live catalogue",
      detail:
        input.unconvertedStarterProducts > 0
          ? `${input.unconvertedStarterProducts} starter listings still need real price and stock records.`
          : input.activeProducts > 0
            ? `${input.activeProducts} active products are managed in PostgreSQL.`
            : "Publish at least one managed product before opening the shop.",
      responsible: "joint",
      configured:
        input.unconvertedStarterProducts === 0 && input.activeProducts > 0,
      blocking: true,
    },
    {
      id: "email",
      category: "operations",
      label: "Transactional email",
      detail: emailConfigured
        ? "The TLS SMTP mailbox and authenticated sender are configured for account and order messages."
        : "Add a TLS SMTP mailbox and authenticated sending address for account and order messages.",
      responsible: "owner",
      configured: emailConfigured,
      blocking: true,
    },
    {
      id: "shipping-rates",
      category: "operations",
      label: "PostNL shipping prices",
      detail: "Dutch and international PostNL rates plus the free-shipping threshold are configured.",
      responsible: "owner",
      configured: Object.values(input.storeProfile.internationalPostnlRates)
        .every(price => Number.isInteger(price) && price >= 0),
      blocking: false,
    },
    {
      id: "shipping",
      category: "operations",
      label: "Automatic PostNL labels",
      detail: postnlProduction
        ? input.trackedOrders > 0
          ? `${input.trackedOrders} ${input.trackedOrders === 1 ? "order has" : "orders have"} tracking recorded; production label creation is enabled.`
          : "Production PostNL credentials are configured. Create the first label from a paid Dutch order to verify fulfilment."
        : postnlCredentials
          ? "PostNL is connected in sandbox mode. Use manual labels and add tracking in the order dashboard until production credentials are enabled."
          : "Manual labels and tracking work now. Add production PostNL credentials to create labels automatically.",
      responsible: "owner",
      configured: postnlProduction,
      blocking: false,
    },
    {
      id: "storage",
      category: "operations",
      label: "Durable product images",
      detail: durableImageStorage
        ? "Owner-controlled object storage is configured for product images."
        : input.embeddedImageCount === 0
          ? "All catalogue images use stable URLs; no database-embedded image data was found."
          : `${input.embeddedImageCount} catalogue ${input.embeddedImageCount === 1 ? "image is" : "images are"} still embedded in database records. Configure R2 or Cloudinary before the catalogue grows further.`,
      responsible: "developer",
      configured: durableImageStorage || input.embeddedImageCount === 0,
      blocking: false,
    },
    {
      id: "monitoring",
      category: "operations",
      label: "Error monitoring",
      detail: present("SENTRY_DSN")
        ? "Sentry is configured for checkout and server-error reporting."
        : "Vercel logs remain available. Add Sentry for proactive checkout and webhook alerts.",
      responsible: "developer",
      configured: present("SENTRY_DSN"),
      blocking: false,
    },
    {
      id: "backups",
      category: "operations",
      label: "Restore-tested backups",
      detail: manuallyConfirmed("backups")
        ? "Scheduled backups and the restore procedure were manually confirmed."
        : "Enable scheduled Railway backups, test a restore, then confirm the result here.",
      responsible: "joint",
      configured:
        process.env.BACKUPS_CONFIRMED === "true" || manuallyConfirmed("backups"),
      blocking: true,
      confirmationId: "backups",
      manuallyConfirmed: manuallyConfirmed("backups"),
    },
    {
      id: "business",
      category: "legal",
      label: "Legal business identity",
      detail: "The owner must provide the legal name, KVK number, VAT ID, address, return address, and support email.",
      responsible: "owner",
      configured: Boolean(
        input.storeProfile.companyName &&
          input.storeProfile.kvkNumber &&
          input.storeProfile.vatId &&
          input.storeProfile.businessAddress &&
          input.storeProfile.returnAddress &&
          input.storeProfile.businessEmail,
      ),
      blocking: true,
    },
    {
      id: "vat",
      category: "legal",
      label: "VAT and invoice rules",
      detail: manuallyConfirmed("vat")
        ? "The owner confirmed the VAT treatment and invoice-display rules used by the shop."
        : "The owner must document standard VAT or margin-scheme treatment for each product type and get qualified Dutch tax advice if uncertain.",
      responsible: "owner",
      configured:
        process.env.VAT_RULES_CONFIRMED === "true" || manuallyConfirmed("vat"),
      blocking: true,
      confirmationId: "vat",
      manuallyConfirmed: manuallyConfirmed("vat"),
    },
    {
      id: "returns",
      category: "legal",
      label: "Online cancellation and return form",
      detail: "Customers and guests can submit a protected request for owner review.",
      responsible: "developer",
      configured: true,
      blocking: true,
    },
    {
      id: "legal-review",
      category: "legal",
      label: "Owner and legal review",
      detail: manuallyConfirmed("legal-review")
        ? "The owner confirmed the published terms, privacy notice, return policy, complaints process, and store copy."
        : "The owner must review and approve the terms, privacy notice, return policy, complaints process, and final store copy.",
      responsible: "owner",
      configured:
        process.env.LEGAL_REVIEW_CONFIRMED === "true" ||
        manuallyConfirmed("legal-review"),
      blocking: true,
      confirmationId: "legal-review",
      manuallyConfirmed: manuallyConfirmed("legal-review"),
    },
    {
      id: "google-login",
      category: "growth",
      label: "Google sign in",
      detail: "Optional OAuth credentials allow customers to use their Google account.",
      responsible: "owner",
      configured: present("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"),
      blocking: false,
    },
    {
      id: "merchant-center",
      category: "growth",
      label: "Google Merchant Center",
      detail: "Optional product feed and domain verification for Shopping listings.",
      responsible: "owner",
      configured: present("GOOGLE_MERCHANT_ID"),
      blocking: false,
    },
  ];

  const blockers = items.filter(item => item.blocking && !item.configured).length;
  const recommendations = items.filter(
    item => !item.blocking && !item.configured,
  ).length;
  const complete = items.filter(item => item.configured).length;
  return {
    ready: blockers === 0,
    blockers,
    recommendations,
    complete,
    total: items.length,
    items,
  };
}
