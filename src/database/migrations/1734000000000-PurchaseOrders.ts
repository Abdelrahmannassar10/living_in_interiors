import { MigrationInterface, QueryRunner } from 'typeorm';

export class PurchaseOrders1734000000000 implements MigrationInterface {
  name = 'PurchaseOrders1734000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."purchase_orders_status_enum" AS ENUM('Draft', 'Sent', 'PartiallyReceived', 'Received', 'Closed', 'Cancelled')`,
    );
    await queryRunner.query(`CREATE TABLE "purchase_orders" (
      "id" SERIAL NOT NULL,
      "purchase_no" character varying(50) NOT NULL,
      "order_date" date NOT NULL DEFAULT ('now'::text)::date,
      "expected_date" date,
      "status" "public"."purchase_orders_status_enum" NOT NULL DEFAULT 'Draft',
      "currency" character varying(10) NOT NULL DEFAULT 'USD',
      "notes" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "supplier_id" integer,
      "created_by" integer,
      CONSTRAINT "UQ_purchase_orders_purchase_no" UNIQUE ("purchase_no"),
      CONSTRAINT "PK_purchase_orders_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_purchase_orders_supplier" ON "purchase_orders" ("supplier_id")`,
    );
    await queryRunner.query(`CREATE TABLE "purchase_order_lines" (
      "id" SERIAL NOT NULL,
      "qty" integer NOT NULL,
      "received_qty" integer NOT NULL DEFAULT '0',
      "unit_cost" numeric(12,2),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "purchase_order_id" integer,
      "item_id" integer,
      CONSTRAINT "UQ_purchase_order_lines_item" UNIQUE ("purchase_order_id", "item_id"),
      CONSTRAINT "PK_purchase_order_lines_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_purchase_order_lines_item" ON "purchase_order_lines" ("item_id")`,
    );
    await queryRunner.query(`CREATE TABLE "goods_receipts" (
      "id" SERIAL NOT NULL,
      "receipt_no" character varying(50) NOT NULL,
      "received_at" date NOT NULL DEFAULT ('now'::text)::date,
      "notes" text,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "purchase_order_id" integer,
      "created_by" integer,
      CONSTRAINT "UQ_goods_receipts_receipt_no" UNIQUE ("receipt_no"),
      CONSTRAINT "PK_goods_receipts_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_goods_receipts_purchase_order" ON "goods_receipts" ("purchase_order_id")`,
    );
    await queryRunner.query(`CREATE TABLE "goods_receipt_lines" (
      "id" SERIAL NOT NULL,
      "qty" integer NOT NULL,
      "unit_cost" numeric(12,2),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "goods_receipt_id" integer,
      "item_id" integer,
      CONSTRAINT "PK_goods_receipt_lines_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_goods_receipt_lines_item" ON "goods_receipt_lines" ("item_id")`,
    );
    await queryRunner.query(`CREATE TABLE "supplier_price_lists" (
      "id" SERIAL NOT NULL,
      "cost" numeric(12,2) NOT NULL,
      "effective_date" date NOT NULL DEFAULT ('now'::text)::date,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "item_id" integer,
      "supplier_id" integer,
      "created_by" integer,
      CONSTRAINT "UQ_supplier_price_lists_supplier_item_date" UNIQUE ("supplier_id", "item_id", "effective_date"),
      CONSTRAINT "PK_supplier_price_lists_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_supplier_price_lists_item_date" ON "supplier_price_lists" ("item_id", "effective_date")`,
    );

    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_purchase_orders_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_purchase_orders_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "FK_purchase_order_lines_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "FK_purchase_order_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" ADD CONSTRAINT "FK_goods_receipts_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" ADD CONSTRAINT "FK_goods_receipts_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "FK_goods_receipt_lines_receipt" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "FK_goods_receipt_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "FK_supplier_price_lists_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "FK_supplier_price_lists_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_price_lists" ADD CONSTRAINT "FK_supplier_price_lists_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "purchase_order_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_purchase_order" ON "transactions" ("purchase_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_transactions_purchase_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_purchase_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "purchase_order_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "supplier_price_lists" DROP CONSTRAINT "FK_supplier_price_lists_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_price_lists" DROP CONSTRAINT "FK_supplier_price_lists_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "supplier_price_lists" DROP CONSTRAINT "FK_supplier_price_lists_supplier"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" DROP CONSTRAINT "FK_goods_receipt_lines_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipt_lines" DROP CONSTRAINT "FK_goods_receipt_lines_receipt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP CONSTRAINT "FK_goods_receipts_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "goods_receipts" DROP CONSTRAINT "FK_goods_receipts_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" DROP CONSTRAINT "FK_purchase_order_lines_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_order_lines" DROP CONSTRAINT "FK_purchase_order_lines_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_purchase_orders_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_purchase_orders_supplier"`,
    );

    await queryRunner.query(`DROP TABLE "supplier_price_lists"`);
    await queryRunner.query(`DROP TABLE "goods_receipt_lines"`);
    await queryRunner.query(`DROP TABLE "goods_receipts"`);
    await queryRunner.query(`DROP TABLE "purchase_order_lines"`);
    await queryRunner.query(`DROP TABLE "purchase_orders"`);
    await queryRunner.query(`DROP TYPE "public"."purchase_orders_status_enum"`);
  }
}
