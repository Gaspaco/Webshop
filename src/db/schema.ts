import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

// Better Auth
export const user = pgTable(
  "user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    role: text("role").default("customer").notNull(),
    ...timestamps,
  },
  table => [uniqueIndex("user_email_idx").on(table.email)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").default(true).notNull(),
    failedVerificationCount: integer("failed_verification_count")
      .default(0)
      .notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  table => [
    uniqueIndex("two_factor_user_id_idx").on(table.userId),
    index("two_factor_secret_idx").on(table.secret),
  ],
);

export const session = pgTable(
  "session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  table => [
    uniqueIndex("session_token_idx").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    ...timestamps,
  },
  table => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  table => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable(
  "rate_limit",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  table => [index("rate_limit_last_request_idx").on(table.lastRequest)],
);

// Store catalog
export const productStatus = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);
export const inventoryReason = pgEnum("inventory_reason", [
  "purchase",
  "sale",
  "return",
  "adjustment",
  "import",
]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
]);
export const paymentStatus = pgEnum("payment_status", [
  "open",
  "pending",
  "authorized",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
]);
export const importStatus = pgEnum("import_status", [
  "queued",
  "processing",
  "completed",
  "failed",
]);
export const discountType = pgEnum("discount_type", ["percentage", "fixed"]);
export const returnStatus = pgEnum("return_status", [
  "requested",
  "approved",
  "rejected",
  "refunded",
]);
export const contactMessageStatus = pgEnum("contact_message_status", [
  "unread",
  "read",
  "resolved",
]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    ...timestamps,
  },
  table => [uniqueIndex("category_slug_idx").on(table.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    brand: text("brand"),
    game: text("game"),
    productType: text("product_type"),
    status: productStatus("status").default("draft").notNull(),
    imageUrls: jsonb("image_urls").$type<string[]>().default([]).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex("product_slug_idx").on(table.slug),
    index("product_category_idx").on(table.categoryId),
    index("product_game_idx").on(table.game),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    language: text("language"),
    condition: text("condition"),
    finish: text("finish"),
    imageUrl: text("image_url"),
    priceCents: integer("price_cents").notNull(),
    compareAtPriceCents: integer("compare_at_price_cents"),
    stock: integer("stock").default(0).notNull(),
    reservedStock: integer("reserved_stock").default(0).notNull(),
    trackInventory: boolean("track_inventory").default(true).notNull(),
    ...timestamps,
  },
  table => [
    uniqueIndex("product_variant_sku_idx").on(table.sku),
    index("product_variant_product_idx").on(table.productId),
  ],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    reason: inventoryReason("reason").notNull(),
    reference: text("reference"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [index("inventory_movement_variant_idx").on(table.variantId)],
);

export const carts = pgTable(
  "carts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    guestToken: text("guest_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  table => [
    index("cart_user_idx").on(table.userId),
    uniqueIndex("cart_guest_token_idx").on(table.guestToken),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  table => [primaryKey({ columns: [table.cartId, table.variantId] })],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [primaryKey({ columns: [table.userId, table.productId] })],
);

export const customerAddresses = pgTable(
  "customer_addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    streetAndHouseNumber: text("street_and_house_number").notNull(),
    postalCode: text("postal_code").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    ...timestamps,
  },
  table => [uniqueIndex("customer_address_user_idx").on(table.userId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNumber: text("order_number").notNull(),
    userId: uuid("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    status: orderStatus("status").default("pending").notNull(),
    currency: text("currency").default("EUR").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    shippingCents: integer("shipping_cents").default(0).notNull(),
    taxCents: integer("tax_cents").default(0).notNull(),
    discountCode: text("discount_code"),
    discountCents: integer("discount_cents").default(0).notNull(),
    shippingMethod: text("shipping_method").default("postnl_parcel").notNull(),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    totalCents: integer("total_cents").notNull(),
    billingAddress: jsonb("billing_address")
      .$type<Record<string, string>>()
      .notNull(),
    shippingAddress: jsonb("shipping_address")
      .$type<Record<string, string>>()
      .notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  table => [
    uniqueIndex("order_number_idx").on(table.orderNumber),
    index("order_user_idx").on(table.userId),
    index("order_status_idx").on(table.status),
  ],
);

export const returnRequests = pgTable(
  "return_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: returnStatus("status").default("requested").notNull(),
    reason: text("reason").notNull(),
    amountCents: integer("amount_cents"),
    adminNote: text("admin_note"),
    resolvedBy: uuid("resolved_by").references(() => user.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  table => [
    index("return_request_order_idx").on(table.orderId),
    index("return_request_status_idx").on(table.status),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "set null",
    }),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
  },
  table => [index("order_item_order_idx").on(table.orderId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    molliePaymentId: text("mollie_payment_id").notNull(),
    status: paymentStatus("status").default("open").notNull(),
    amountCents: integer("amount_cents").notNull(),
    method: text("method"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    ...timestamps,
  },
  table => [
    uniqueIndex("payment_mollie_id_idx").on(table.molliePaymentId),
    index("payment_order_idx").on(table.orderId),
  ],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: importStatus("status").default("queued").notNull(),
    source: text("source").notNull(),
    fileName: text("file_name"),
    totalRows: integer("total_rows").default(0).notNull(),
    processedRows: integer("processed_rows").default(0).notNull(),
    failedRows: integer("failed_rows").default(0).notNull(),
    errors: jsonb("errors")
      .$type<Array<{ row: number; message: string }>>()
      .default([])
      .notNull(),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  table => [index("import_job_status_idx").on(table.status)],
);

export const discountCodes = pgTable(
  "discount_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    type: discountType("type").notNull(),
    value: integer("value").notNull(),
    minimumOrderCents: integer("minimum_order_cents").default(0).notNull(),
    maximumUses: integer("maximum_uses"),
    usedCount: integer("used_count").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  table => [
    uniqueIndex("discount_code_idx").on(table.code),
    index("discount_active_idx").on(table.active),
  ],
);

export const storefrontContent = pgTable(
  "storefront_content",
  {
    key: text("key").primaryKey(),
    value: jsonb("value").$type<Record<string, unknown>>().notNull(),
    updatedBy: uuid("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
);

export const contactMessages = pgTable(
  "contact_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    topic: text("topic").notNull(),
    message: text("message").notNull(),
    status: contactMessageStatus("status").default("unread").notNull(),
    notificationSent: boolean("notification_sent").default(false).notNull(),
    updatedBy: uuid("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  table => [
    index("contact_message_status_idx").on(table.status),
    index("contact_message_created_idx").on(table.createdAt),
  ],
);

export const customerAdminProfiles = pgTable(
  "customer_admin_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().default([]).notNull(),
    suspended: boolean("suspended").default(false).notNull(),
    updatedBy: uuid("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    index("admin_audit_actor_idx").on(table.actorId),
    index("admin_audit_created_idx").on(table.createdAt),
    index("admin_audit_entity_idx").on(table.entityType, table.entityId),
  ],
);
