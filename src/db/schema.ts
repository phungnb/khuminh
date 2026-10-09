// Lược đồ dữ liệu. Mọi bảng nghiệp vụ có org_id và được bảo vệ bằng Row Level Security
// (xem drizzle/0001_rls.sql). Tiền là bigint đồng; chỉ số đồng hồ là bigint centi đơn vị.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
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
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: id(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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

export const paymentMethod = pgEnum("payment_method", ["cash", "transfer", "other"]);

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
