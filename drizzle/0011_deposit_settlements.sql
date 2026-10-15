CREATE TYPE "public"."last_month_mode" AS ENUM('daily', 'full_month');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'deposit';--> statement-breakpoint
CREATE TABLE "deposit_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"lease_id" uuid NOT NULL,
	"final_invoice_id" uuid NOT NULL,
	"settled_on" date NOT NULL,
	"last_month_mode" "last_month_mode" NOT NULL,
	"deposit_held" bigint NOT NULL,
	"deposit_held_note" text,
	"debt_before" bigint NOT NULL,
	"full_month_top_up" bigint DEFAULT 0 NOT NULL,
	"deductions" jsonb NOT NULL,
	"credit_applied" bigint DEFAULT 0 NOT NULL,
	"deposit_applied" bigint NOT NULL,
	"refund_due" bigint NOT NULL,
	"tenant_owes" bigint NOT NULL,
	"deposit_payment_id" uuid,
	"refunded_on" date,
	"refund_method" "payment_method",
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text
);
--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "due_day" integer;--> statement-breakpoint
ALTER TABLE "deposit_settlements" ADD CONSTRAINT "deposit_settlements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_settlements" ADD CONSTRAINT "deposit_settlements_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_settlements" ADD CONSTRAINT "deposit_settlements_final_invoice_id_invoices_id_fk" FOREIGN KEY ("final_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_settlements" ADD CONSTRAINT "deposit_settlements_deposit_payment_id_payments_id_fk" FOREIGN KEY ("deposit_payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_settlements" ADD CONSTRAINT "deposit_settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_settlements_lease_live" ON "deposit_settlements" USING btree ("lease_id") WHERE voided_at is null;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_due_day_range" CHECK (due_day IS NULL OR due_day BETWEEN 1 AND 28);
--> statement-breakpoint
-- Số tiền quyết toán không âm; hoàn cọc chỉ bằng tiền mặt/chuyển khoản/khác (không dùng giá trị 'deposit' mới thêm,
-- vì giá trị enum vừa ADD VALUE chưa dùng được trong cùng giao dịch migration).
ALTER TABLE "deposit_settlements" ADD CONSTRAINT "deposit_settlements_amounts" CHECK (
  deposit_held >= 0 AND debt_before >= 0 AND full_month_top_up >= 0 AND credit_applied >= 0 AND deposit_applied >= 0
  AND refund_due >= 0 AND tenant_owes >= 0
  AND (refund_method IS NULL OR refund_method IN ('cash', 'transfer', 'other'))
);
--> statement-breakpoint
-- Quyết toán cọc: cô lập theo tổ chức như mọi bảng nghiệp vụ, bật RLS ngay trong migration tạo bảng.
-- Quyền theo cơ sở và chỉ chủ trọ được quyết toán: kiểm ở src/server/deposit.ts.
ALTER TABLE deposit_settlements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY org_isolation ON deposit_settlements USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'khuminh_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON deposit_settlements TO khuminh_app;
  END IF;
END $$;
