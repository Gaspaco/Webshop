export type LaunchReadinessItem = {
  id: string;
  category: "commerce" | "operations" | "legal" | "growth";
  label: string;
  detail: string;
  responsible: "developer" | "owner" | "joint";
  configured: boolean;
  blocking: boolean;
};

const present = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));

export function getLaunchReadiness(input: { unconvertedStarterProducts: number }) {
  const items: LaunchReadinessItem[] = [
    {
      id: "database",
      category: "commerce",
      label: "PostgreSQL connection",
      detail: "Railway database connection is available to the application.",
      responsible: "developer",
      configured: present("DATABASE_URL") || present("DATABASE_PUBLIC_URL"),
      blocking: true,
    },
    {
      id: "mollie-live",
      category: "commerce",
      label: "Mollie live payments",
      detail: "A live Mollie key must be configured before accepting real orders.",
      responsible: "owner",
      configured: process.env.MOLLIE_API_KEY?.startsWith("live_") ?? false,
      blocking: true,
    },
    {
      id: "inventory",
      category: "commerce",
      label: "Transactional stock reservation",
      detail: "Managed variants are reserved at checkout and committed by the payment webhook.",
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
          : "Every visible starter listing has been converted to a managed database record.",
      responsible: "joint",
      configured: input.unconvertedStarterProducts === 0,
      blocking: true,
    },
    {
      id: "email",
      category: "operations",
      label: "Transactional email",
      detail: "Resend and a verified sending address are required for account and order messages.",
      responsible: "owner",
      configured: present("RESEND_API_KEY", "AUTH_EMAIL_FROM"),
      blocking: true,
    },
    {
      id: "shipping",
      category: "operations",
      label: "Shipping carrier account",
      detail: "Choose PostNL or DHL and add the provider credentials, parcel rules, and owner-approved rates.",
      responsible: "owner",
      configured: present("SHIPPING_PROVIDER", "SHIPPING_API_KEY"),
      blocking: true,
    },
    {
      id: "storage",
      category: "operations",
      label: "Product image storage",
      detail: "Use R2 or Cloudinary instead of storing uploaded images as database data URLs.",
      responsible: "developer",
      configured:
        present("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") ||
        present("CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"),
      blocking: true,
    },
    {
      id: "monitoring",
      category: "operations",
      label: "Error monitoring",
      detail: "Add Sentry before launch so checkout and webhook failures are reported immediately.",
      responsible: "developer",
      configured: present("SENTRY_DSN"),
      blocking: true,
    },
    {
      id: "backups",
      category: "operations",
      label: "Restore-tested backups",
      detail: "The owner must enable Railway backups and the developer must test a restore procedure.",
      responsible: "joint",
      configured: process.env.BACKUPS_CONFIRMED === "true",
      blocking: true,
    },
    {
      id: "business",
      category: "legal",
      label: "Legal business identity",
      detail: "The owner must provide the legal name, KVK number, VAT ID, address, return address, and support email.",
      responsible: "owner",
      configured: present(
        "BUSINESS_LEGAL_NAME",
        "BUSINESS_KVK_NUMBER",
        "BUSINESS_VAT_ID",
        "BUSINESS_ADDRESS",
        "BUSINESS_RETURN_ADDRESS",
        "BUSINESS_SUPPORT_EMAIL",
      ),
      blocking: true,
    },
    {
      id: "vat",
      category: "legal",
      label: "VAT and invoice rules",
      detail: "The owner and accountant must confirm standard VAT, margin-scheme, and invoice-display rules for each product type.",
      responsible: "owner",
      configured: process.env.VAT_RULES_CONFIRMED === "true",
      blocking: true,
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
      detail: "The owner must approve the terms, privacy notice, return exclusions, complaints process, and final store copy.",
      responsible: "owner",
      configured: process.env.LEGAL_REVIEW_CONFIRMED === "true",
      blocking: true,
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
  const complete = items.filter(item => item.configured).length;
  return {
    ready: blockers === 0,
    blockers,
    complete,
    total: items.length,
    items,
  };
}
