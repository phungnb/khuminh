// Lược đồ dữ liệu. Mọi bảng nghiệp vụ có org_id và được bảo vệ bằng Row Level Security
// (xem drizzle/0001_rls.sql). Tiền là bigint đồng; chỉ số đồng hồ là bigint centi đơn vị.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const orgId = () => uuid("org_id").notNull().references(() => organizations.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => bigint(name, { mode: "number" });

// ---------- Danh tính (không thuộc tổ chức, không RLS) ----------

export const users = pgTable("users", {
  id: id(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash"),
  /** Admin nền tảng khóa (spam/lừa đảo): không đăng nhập được, phiên cũ hết hiệu lực. */
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/**
 * Admin nền tảng. Bật RLS, KHÔNG có policy: app không đọc/ghi được; chỉ các hàm SECURITY DEFINER
 * admin_* (drizzle/0009_platform_admin.sql) đọc. Thêm admin bằng scripts/grant-admin.ts (role chủ bảng).
 */
export const platformAdmins = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

/**
 * Nhật ký thao tác admin nền tảng (ẩn tin, khóa tài khoản). Không thuộc tổ chức nào nên không dùng audit_logs.
 * Bật RLS, KHÔNG có policy: chỉ hàm SECURITY DEFINER admin_* ghi/đọc (drizzle/0010_admin_actions.sql).
 */
export const adminActions = pgTable("admin_actions", {
  id: id(),
  adminUserId: uuid("admin_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
});

export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const memberRole = pgEnum("member_role", ["owner", "staff"]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: memberRole("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user").on(t.orgId, t.userId)],
);

// ---------- Cơ sở và phòng ----------

export const properties = pgTable(
  "properties",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    address: text("address"),
    /** Làm tròn tổng hóa đơn tới bội số này: 1, 100, 500, 1000. */
    roundTotalTo: integer("round_total_to").notNull().default(1),
    /** Ngày đến hạn = ngày cuối kỳ + số ngày này. */
    dueDays: integer("due_days").notNull().default(10),
    bankBin: text("bank_bin"),
    bankAccountNo: text("bank_account_no"),
    bankAccountName: text("bank_account_name"),
    /** Tọa độ cơ sở (WGS84) — tâm "chợ quanh đây" cho cư dân của cơ sở. */
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("properties_org").on(t.orgId)],
);

/** Nhân viên được giao cơ sở nào. Chủ sở hữu thấy mọi cơ sở trong tổ chức. */
export const propertyStaff = pgTable(
  "property_staff",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => [uniqueIndex("property_staff_unique").on(t.propertyId, t.userId)],
);

export const unitStatus = pgEnum("unit_status", ["active", "maintenance", "inactive"]);

export const units = pgTable(
  "units",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    /** Dãy/tòa, tùy chọn. */
    block: text("block"),
    code: text("code").notNull(),
    status: unitStatus("status").notNull().default("active"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("units_property_code").on(t.propertyId, t.code)],
);

// ---------- Người thuê và hợp đồng ----------

export const tenants = pgTable(
  "tenants",
  {
    id: id(),
    orgId: orgId(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    /** Liên kết khi người thuê tạo tài khoản KhuMình. */
    userId: uuid("user_id").references(() => users.id),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("tenants_org").on(t.orgId)],
);

export const leaseStatus = pgEnum("lease_status", ["draft", "active", "ended"]);

export const leases = pgTable(
  "leases",
  {
    id: id(),
    orgId: orgId(),
    unitId: uuid("unit_id").notNull().references(() => units.id),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    status: leaseStatus("status").notNull().default("active"),
    startDate: date("start_date").notNull(),
    /** Ngày hết hạn ghi trên hợp đồng (để nhắc gia hạn). */
    expiresOn: date("expires_on"),
    /** Ngày ở cuối cùng khi đã chuyển đi. */
    movedOutOn: date("moved_out_on"),
    deposit: money("deposit").notNull().default(0),
    occupants: integer("occupants").notNull().default(1),
    /** Ngày thu tiền theo thỏa thuận (1–28). Hạn trả hóa đơn = ngày này của tháng sau cuối kỳ; trống thì dùng hạn chung của cơ sở. */
    dueDay: integer("due_day"),
    documentKey: text("document_key"),
    createdAt: createdAt(),
  },
  (t) => [index("leases_unit").on(t.unitId)],
);

export const leaseRents = pgTable(
  "lease_rents",
  {
    id: id(),
    orgId: orgId(),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    effectiveFrom: date("effective_from").notNull(),
    amount: money("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lease_rents_unique").on(t.leaseId, t.effectiveFrom)],
);

export const leaseQuantities = pgTable(
  "lease_quantities",
  {
    id: id(),
    orgId: orgId(),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    feeKey: text("fee_key").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [uniqueIndex("lease_quantities_unique").on(t.leaseId, t.feeKey)],
);

// ---------- Đồng hồ và biểu phí ----------

export const meterKind = pgEnum("meter_kind", ["electricity", "water"]);

export const meters = pgTable("meters", {
  id: id(),
  orgId: orgId(),
  unitId: uuid("unit_id").notNull().references(() => units.id),
  kind: meterKind("kind").notNull(),
  name: text("name").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const meterReadings = pgTable(
  "meter_readings",
  {
    id: id(),
    orgId: orgId(),
    meterId: uuid("meter_id").notNull().references(() => meters.id),
    readingDate: date("reading_date").notNull(),
    valueCenti: bigint("value_centi", { mode: "number" }).notNull(),
    imageKey: text("image_key"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("meter_readings_unique").on(t.meterId, t.readingDate)],
);

export const feeMethod = pgEnum("fee_method", ["fixed", "per_person", "per_quantity", "metered"]);

export const feeRules = pgTable(
  "fee_rules",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    method: feeMethod("method").notNull(),
    unitPrice: money("unit_price").notNull(),
    tiers: jsonb("tiers").$type<Array<{ upToCenti: number | null; unitPrice: number }>>(),
    meterKind: meterKind("meter_kind"),
    unitLabel: text("unit_label"),
    prorate: boolean("prorate").notNull().default(true),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: createdAt(),
  },
  (t) => [index("fee_rules_property").on(t.propertyId)],
);

// ---------- Kỳ, hóa đơn, thanh toán ----------

export const periodStatus = pgEnum("period_status", ["open", "closed"]);

export const billingPeriods = pgTable(
  "billing_periods",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    dueDate: date("due_date").notNull(),
    status: periodStatus("status").notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_periods_unique").on(t.propertyId, t.periodStart)],
);

export const invoiceStatus = pgEnum("invoice_status", ["draft", "issued", "void"]);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    unitId: uuid("unit_id").notNull().references(() => units.id),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    billingPeriodId: uuid("billing_period_id").notNull().references(() => billingPeriods.id),
    code: text("code").notNull(),
    status: invoiceStatus("status").notNull().default("draft"),
    /** Tổng các dòng (đã gồm làm tròn), chưa gồm điều chỉnh. */
    subtotal: money("subtotal").notNull(),
    /** subtotal + tổng điều chỉnh. */
    total: money("total").notNull(),
    dueDate: date("due_date").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_code").on(t.orgId, t.code),
    // Mỗi hợp đồng chỉ có một hóa đơn còn hiệu lực trong một kỳ.
    uniqueIndex("invoices_lease_period_live").on(t.leaseId, t.billingPeriodId).where(sql`status <> 'void'`),
  ],
);

export const lineKind = pgEnum("line_kind", ["rent", "fee", "rounding"]);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  orgId: orgId(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  kind: lineKind("kind").notNull(),
  key: text("key").notNull(),
  description: text("description").notNull(),
  quantityCenti: bigint("quantity_centi", { mode: "number" }),
  unitPrice: money("unit_price"),
  amount: money("amount").notNull(),
  meta: jsonb("meta"),
});

export const invoiceAdjustments = pgTable("invoice_adjustments", {
  id: id(),
  orgId: orgId(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  /** Âm là giảm (ví dụ trừ tiền cọc), dương là tăng. */
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** "deposit": cấn trừ tiền cọc vào nợ khi quyết toán trả phòng, không phải tiền mới thu vào. */
export const paymentMethod = pgEnum("payment_method", ["cash", "transfer", "other", "deposit"]);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    amount: money("amount").notNull(),
    method: paymentMethod("method").notNull(),
    receivedOn: date("received_on").notNull(),
    reference: text("reference"),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    /** Khóa chống ghi trùng khi bấm hai lần. */
    idempotencyKey: text("idempotency_key"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payments_idempotency").on(t.orgId, t.idempotencyKey)],
);

export const paymentAllocations = pgTable("payment_allocations", {
  id: id(),
  orgId: orgId(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  amount: money("amount").notNull(),
});

export const lastMonthMode = pgEnum("last_month_mode", ["daily", "full_month"]);

/**
 * Quyết toán cọc khi trả phòng (KM-COC). Lưu ảnh chụp số liệu lúc quyết toán; tiền thật đi qua
 * điều chỉnh hóa đơn (bù tháng, khấu trừ) và một thanh toán method=deposit (cấn trừ cọc).
 * Mỗi hợp đồng chỉ có một bản quyết toán còn hiệu lực.
 */
export const depositSettlements = pgTable(
  "deposit_settlements",
  {
    id: id(),
    orgId: orgId(),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    /** Hóa đơn cuối (kỳ chứa ngày chuyển đi), nơi ghi dòng bù tháng và khấu trừ. */
    finalInvoiceId: uuid("final_invoice_id").notNull().references(() => invoices.id),
    settledOn: date("settled_on").notNull(),
    lastMonthMode: lastMonthMode("last_month_mode").notNull(),
    depositHeld: money("deposit_held").notNull(),
    depositHeldNote: text("deposit_held_note"),
    debtBefore: money("debt_before").notNull(),
    fullMonthTopUp: money("full_month_top_up").notNull().default(0),
    deductions: jsonb("deductions").$type<Array<{ reason: string; amount: number }>>().notNull(),
    /** Tiền khách trả dư trước đó, dùng trừ nợ trước cọc. */
    creditApplied: money("credit_applied").notNull().default(0),
    depositApplied: money("deposit_applied").notNull(),
    refundDue: money("refund_due").notNull(),
    tenantOwes: money("tenant_owes").notNull(),
    depositPaymentId: uuid("deposit_payment_id").references(() => payments.id),
    refundedOn: date("refunded_on"),
    refundMethod: paymentMethod("refund_method"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
  },
  (t) => [uniqueIndex("deposit_settlements_lease_live").on(t.leaseId).where(sql`voided_at is null`)],
);

/** Link hóa đơn gửi người thuê. Chỉ lưu băm SHA-256 của token. */
export const invoiceShareTokens = pgTable("invoice_share_tokens", {
  id: id(),
  orgId: orgId(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  openCount: integer("open_count").notNull().default(0),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Link mời người thuê tạo tài khoản app, gắn với hồ sơ người thuê. Chỉ lưu băm token. */
export const tenantInvites = pgTable("tenant_invites", {
  id: id(),
  orgId: orgId(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Link mời nhân viên vào quản lý một cơ sở. Chỉ lưu băm token. */
export const staffInvites = pgTable("staff_invites", {
  id: id(),
  orgId: orgId(),
  propertyId: uuid("property_id").notNull().references(() => properties.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: uuid("used_by").references(() => users.id),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/** Đăng ký nhận thông báo đẩy của trình duyệt/app (Web Push). Thuộc người dùng, không thuộc tổ chức. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscriptions_user").on(t.userId)],
);

// ---------- Bảng tin khu trọ ----------

export const postKind = pgEnum("post_kind", ["announcement", "sell", "give", "want"]);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    kind: postKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    price: money("price"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("posts_property").on(t.propertyId, t.createdAt)],
);

// ---------- Báo sự cố (yêu cầu sửa chữa) ----------
// Người thuê đang ở báo sự cố phòng; chủ trọ/nhân viên của cơ sở xử lý. RLS theo tổ chức
// (org_isolation); quyền theo cơ sở/phòng kiểm ở src/server/maintenance.ts.

export const maintenanceStatus = pgEnum("maintenance_status", ["open", "in_progress", "done", "rejected"]);

export const maintenanceRequests = pgTable(
  "maintenance_requests",
  {
    id: id(),
    orgId: orgId(),
    propertyId: uuid("property_id").notNull().references(() => properties.id),
    unitId: uuid("unit_id").notNull().references(() => units.id),
    leaseId: uuid("lease_id").notNull().references(() => leases.id),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    title: text("title").notNull(),
    body: text("body"),
    urgent: boolean("urgent").notNull().default(false),
    status: maintenanceStatus("status").notNull().default("open"),
    /** Ghi chú xử lý của chủ trọ/nhân viên; bắt buộc khi từ chối. */
    resolutionNote: text("resolution_note"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("maintenance_property").on(t.propertyId, t.createdAt), index("maintenance_lease").on(t.leaseId)],
);

// ---------- Nhật ký ----------

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    orgId: orgId(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_entity").on(t.entityType, t.entityId)],
);

// ---------- Chợ tiện ích quanh đây ----------
// Không thuộc tổ chức: tin đăng là của người dùng, ai đăng nhập cũng xem được trong bán kính.
// RLS theo người dùng (app.user_id), xem drizzle/0007_market_rls.sql. Liên hệ tách bảng riêng,
// chỉ lộ cho người đăng và người quan tâm đã được đồng ý.

export const listingKind = pgEnum("listing_kind", ["sell", "want", "give", "service"]);
export const listingStatus = pgEnum("listing_status", ["open", "closed"]);

export const listings = pgTable(
  "listings",
  {
    id: id(),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    kind: listingKind("kind").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    price: money("price"),
    /** Tọa độ đã làm tròn (~500 m) để không lộ vị trí chính xác. */
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    areaLabel: text("area_label").notNull(),
    status: listingStatus("status").notNull().default("open"),
    /** Ẩn tự động khi đủ báo cáo vi phạm (trigger), chỉ người đăng còn thấy. */
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("listings_geo").on(t.lat, t.lng), index("listings_author").on(t.authorUserId)],
);

export const listingContacts = pgTable("listing_contacts", {
  listingId: uuid("listing_id")
    .primaryKey()
    .references(() => listings.id, { onDelete: "cascade" }),
  contact: text("contact").notNull(),
});

export const interestStatus = pgEnum("interest_status", ["pending", "accepted", "declined"]);

export const listingInterests = pgTable(
  "listing_interests",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    /** Liên hệ của người quan tâm (SĐT/Zalo), chỉ người đăng tin thấy. */
    contact: text("contact").notNull(),
    note: text("note"),
    status: interestStatus("status").notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("listing_interests_unique").on(t.listingId, t.userId)],
);

export const listingReports = pgTable(
  "listing_reports",
  {
    id: id(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("listing_reports_unique").on(t.listingId, t.userId)],
);
