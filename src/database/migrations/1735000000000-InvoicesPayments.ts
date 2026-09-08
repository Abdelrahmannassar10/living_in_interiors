import { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoicesPayments1735000000000 implements MigrationInterface {
  name = 'InvoicesPayments1735000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."invoices_status_enum" AS ENUM('Open', 'PartiallyPaid', 'Paid', 'Cancelled')`,
    );
    await queryRunner.query(`CREATE TABLE "invoices" (
      "id" SERIAL NOT NULL,
      "invoice_no" character varying(50) NOT NULL,
      "invoice_date" date NOT NULL DEFAULT ('now'::text)::date,
      "client_name" character varying(200),
      "status" "public"."invoices_status_enum" NOT NULL DEFAULT 'Open',
      "currency" character varying(10) NOT NULL DEFAULT 'USD',
      "subtotal" numeric(12,2) NOT NULL DEFAULT '0',
      "discount_global" numeric(5,2) NOT NULL DEFAULT '0',
      "vat_percent" numeric(5,2) NOT NULL DEFAULT '0',
      "total" numeric(12,2) NOT NULL,
      "notes" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "client_id" integer,
      "sales_order_id" integer,
      "created_by" integer,
      CONSTRAINT "UQ_invoices_invoice_no" UNIQUE ("invoice_no"),
      CONSTRAINT "PK_invoices_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_client" ON "invoices" ("client_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_invoices_sales_order" ON "invoices" ("sales_order_id")`,
    );
    await queryRunner.query(`CREATE TABLE "invoice_lines" (
      "id" SERIAL NOT NULL,
      "qty" integer NOT NULL,
      "code_snapshot" character varying(100),
      "description_snapshot" character varying(500),
      "unit_price" numeric(12,2) NOT NULL,
      "discount_percent" numeric(5,2) NOT NULL DEFAULT '0',
      "total_price" numeric(12,2) NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "invoice_id" integer NOT NULL,
      "item_id" integer,
      CONSTRAINT "PK_invoice_lines_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_invoice_lines_invoice" ON "invoice_lines" ("invoice_id")`,
    );
    await queryRunner.query(`CREATE TABLE "payments" (
      "id" SERIAL NOT NULL,
      "payment_no" character varying(50) NOT NULL,
      "payment_date" date NOT NULL DEFAULT ('now'::text)::date,
      "client_name" character varying(200),
      "amount" numeric(12,2) NOT NULL,
      "method" character varying(50),
      "reference_no" character varying(100),
      "notes" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "client_id" integer,
      "created_by" integer,
      CONSTRAINT "UQ_payments_payment_no" UNIQUE ("payment_no"),
      CONSTRAINT "PK_payments_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_client" ON "payments" ("client_id")`,
    );
    await queryRunner.query(`CREATE TABLE "payment_allocations" (
      "id" SERIAL NOT NULL,
      "amount" numeric(12,2) NOT NULL,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "payment_id" integer NOT NULL,
      "invoice_id" integer NOT NULL,
      CONSTRAINT "PK_payment_allocations_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_allocations_payment" ON "payment_allocations" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payment_allocations_invoice" ON "payment_allocations" ("invoice_id")`,
    );

    await queryRunner.query(
      `ALTER TABLE "invoice_lines" ADD CONSTRAINT "FK_invoice_lines_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_lines" ADD CONSTRAINT "FK_invoice_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" ADD CONSTRAINT "FK_invoices_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" ADD CONSTRAINT "FK_payment_allocations_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" ADD CONSTRAINT "FK_payment_allocations_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_payment_allocations_invoice"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_allocations" DROP CONSTRAINT "FK_payment_allocations_payment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_client"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_sales_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoices" DROP CONSTRAINT "FK_invoices_client"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_lines" DROP CONSTRAINT "FK_invoice_lines_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "invoice_lines" DROP CONSTRAINT "FK_invoice_lines_invoice"`,
    );

    await queryRunner.query(`DROP TABLE "payment_allocations"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TABLE "invoice_lines"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`DROP TYPE "public"."invoices_status_enum"`);
  }
}
