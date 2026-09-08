import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2B: sales orders, reservations and deliveries.
 *  - sales_orders + sales_order_lines (snapshot-priced lines, per-line shortage flag)
 *  - reservations (item x location x qty held for a confirmed order)
 *  - deliveries + delivery_lines (records handover; drives auto-Close)
 *  - filtered unique index: one active order per quotation
 */
export class SalesOrdersDeliveries1730000000000 implements MigrationInterface {
  name = 'SalesOrdersDeliveries1730000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."sales_orders_status_enum" AS ENUM('Draft', 'Confirmed', 'Delivered', 'Closed', 'Cancelled')`,
    );

    await queryRunner.query(`CREATE TABLE "sales_orders" (
            "id" SERIAL NOT NULL,
            "order_no" character varying(50) NOT NULL,
            "order_date" date NOT NULL DEFAULT CURRENT_DATE,
            "client_name" character varying(200),
            "contact_person" character varying(200),
            "phone" character varying(50),
            "email" character varying(200),
            "status" "public"."sales_orders_status_enum" NOT NULL DEFAULT 'Draft',
            "expected_delivery_date" date,
            "discount_global" numeric(5,2) NOT NULL DEFAULT '0',
            "vat_percent" numeric(5,2) NOT NULL DEFAULT '0',
            "currency" character varying(10) NOT NULL DEFAULT 'USD',
            "notes" text,
            "internal_notes" text,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            "client_id" integer,
            "quotation_id" integer,
            "created_by" integer,
            CONSTRAINT "PK_sales_orders" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_sales_orders_order_no" UNIQUE ("order_no"))`);

    await queryRunner.query(`CREATE TABLE "sales_order_lines" (
            "id" SERIAL NOT NULL,
            "sort_order" integer NOT NULL DEFAULT '0',
            "code_snapshot" character varying(100),
            "description_snapshot" character varying(500),
            "brand_snapshot" character varying(200),
            "qty" integer NOT NULL DEFAULT '1',
            "qty_delivered" integer NOT NULL DEFAULT '0',
            "shortage" boolean NOT NULL DEFAULT false,
            "unit_price" numeric(12,2) NOT NULL,
            "currency" character varying(10) NOT NULL DEFAULT 'USD',
            "discount_percent" numeric(5,2) NOT NULL DEFAULT '0',
            "total_price" numeric(12,2) NOT NULL,
            "total_price_after_discount" numeric(12,2) NOT NULL,
            "notes" text,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            "sales_order_id" integer NOT NULL,
            "item_id" integer,
            CONSTRAINT "PK_sales_order_lines" PRIMARY KEY ("id"))`);

    await queryRunner.query(`CREATE TABLE "reservations" (
            "id" SERIAL NOT NULL,
            "qty" integer NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            "sales_order_id" integer NOT NULL,
            "item_id" integer NOT NULL,
            "location_id" integer NOT NULL,
            CONSTRAINT "PK_reservations" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_reservation_order_item_location" UNIQUE ("sales_order_id", "item_id", "location_id"))`);

    await queryRunner.query(`CREATE TABLE "deliveries" (
            "id" SERIAL NOT NULL,
            "delivery_no" character varying(50) NOT NULL,
            "delivered_at" date NOT NULL DEFAULT CURRENT_DATE,
            "notes" text,
            "pdf_path" character varying(500),
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
            "sales_order_id" integer NOT NULL,
            "created_by" integer,
            CONSTRAINT "PK_deliveries" PRIMARY KEY ("id"),
            CONSTRAINT "UQ_deliveries_delivery_no" UNIQUE ("delivery_no"))`);

    await queryRunner.query(`CREATE TABLE "delivery_lines" (
            "id" SERIAL NOT NULL,
            "code_snapshot" character varying(100),
            "description_snapshot" character varying(500),
            "sales_order_line_id" integer,
            "qty" integer NOT NULL,
            "created_at" TIMESTAMP NOT NULL DEFAULT now(),
            "delivery_id" integer NOT NULL,
            "item_id" integer,
            CONSTRAINT "PK_delivery_lines" PRIMARY KEY ("id"))`);

    // FKs
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD CONSTRAINT "FK_sales_orders_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD CONSTRAINT "FK_sales_orders_quotation" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_orders" ADD CONSTRAINT "FK_sales_orders_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_order_lines" ADD CONSTRAINT "FK_sales_order_lines_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sales_order_lines" ADD CONSTRAINT "FK_sales_order_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_reservations_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_reservations_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reservations" ADD CONSTRAINT "FK_reservations_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD CONSTRAINT "FK_deliveries_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD CONSTRAINT "FK_deliveries_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_lines" ADD CONSTRAINT "FK_delivery_lines_delivery" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_lines" ADD CONSTRAINT "FK_delivery_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    // One active order per quotation: filtered unique index (ignores cancelled).
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_sales_orders_active_quotation" ON "sales_orders" ("quotation_id") WHERE "quotation_id" IS NOT NULL AND "status" <> 'Cancelled'`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_sales_order_lines_order_id" ON "sales_order_lines" ("sales_order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_reservations_order_id" ON "reservations" ("sales_order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_deliveries_order_id" ON "deliveries" ("sales_order_id")`,
    );

    // Quotations gain 'Converted' when their sales order is confirmed.
    await queryRunner.query(
      `ALTER TYPE "public"."quotations_status_enum" ADD VALUE IF NOT EXISTS 'Converted'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "delivery_lines"`);
    await queryRunner.query(`DROP TABLE "deliveries"`);
    await queryRunner.query(`DROP TABLE "reservations"`);
    await queryRunner.query(`DROP TABLE "sales_order_lines"`);
    await queryRunner.query(`DROP TABLE "sales_orders"`);
    await queryRunner.query(`DROP TYPE "public"."sales_orders_status_enum"`);
  }
}
