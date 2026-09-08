import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Stock model refactor:
 *  - item_stocks table replaces the hard-coded qty_showroom/qty_storage1/qty_storage2 columns
 *  - transactions get jsonb stock_before/stock_after snapshots (keyed by location id)
 *  - number_sequences table for race-free document numbering
 *  - FK/filtered indexes for the hot query paths
 */
export class StockModelRefactor1725700000000 implements MigrationInterface {
    name = 'StockModelRefactor1725700000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "item_stocks" ("id" SERIAL NOT NULL, "qty_on_hand" integer NOT NULL DEFAULT '0', "qty_reserved" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "item_id" integer NOT NULL, "location_id" integer NOT NULL, CONSTRAINT "PK_item_stocks" PRIMARY KEY ("id"), CONSTRAINT "UQ_item_stock_item_location" UNIQUE ("item_id", "location_id"))`);
        await queryRunner.query(`ALTER TABLE "item_stocks" ADD CONSTRAINT "FK_item_stocks_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "item_stocks" ADD CONSTRAINT "FK_item_stocks_location" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);

        // Backfill: seed locations are inserted by run-seeds in a fixed order (Showroom, Storage 1, Storage 2).
        // Map by name so non-sequential ids are safe; rows are created only where stock > 0.
        await queryRunner.query(`
            INSERT INTO "item_stocks" ("item_id", "location_id", "qty_on_hand")
            SELECT i.id, l.id,
                   CASE l.name WHEN 'Showroom' THEN i.qty_showroom WHEN 'Storage 1' THEN i.qty_storage1 WHEN 'Storage 2' THEN i.qty_storage2 ELSE 0 END
            FROM "items" i
            JOIN "locations" l ON l.name IN ('Showroom', 'Storage 1', 'Storage 2')
            WHERE CASE l.name WHEN 'Showroom' THEN i.qty_showroom WHEN 'Storage 1' THEN i.qty_storage1 WHEN 'Storage 2' THEN i.qty_storage2 ELSE 0 END > 0
        `);

        await queryRunner.query(`ALTER TABLE "transactions" ADD "stock_before" jsonb`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "stock_after" jsonb`);
        // Convert the 8 flat snapshot columns into jsonb keyed by location id, then drop them.
        await queryRunner.query(`
            UPDATE "transactions" SET
                "stock_before" = jsonb_strip_nulls(jsonb_build_object(
                    '1', CASE WHEN "qty_showroom_before" IS NULL THEN NULL ELSE jsonb_build_object('onHand', "qty_showroom_before", 'reserved', 0) END,
                    '2', CASE WHEN "qty_storage1_before" IS NULL THEN NULL ELSE jsonb_build_object('onHand', "qty_storage1_before", 'reserved', 0) END,
                    '3', CASE WHEN "qty_storage2_before" IS NULL THEN NULL ELSE jsonb_build_object('onHand', "qty_storage2_before", 'reserved', 0) END)),
                "stock_after" = jsonb_strip_nulls(jsonb_build_object(
                    '1', CASE WHEN "qty_showroom_after" IS NULL THEN NULL ELSE jsonb_build_object('onHand', "qty_showroom_after", 'reserved', 0) END,
                    '2', CASE WHEN "qty_storage1_after" IS NULL THEN NULL ELSE jsonb_build_object('onHand', "qty_storage1_after", 'reserved', 0) END,
                    '3', CASE WHEN "qty_storage2_after" IS NULL THEN NULL ELSE jsonb_build_object('onHand', "qty_storage2_after", 'reserved', 0) END))
        `);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "qty_showroom_before", DROP COLUMN "qty_storage1_before", DROP COLUMN "qty_storage2_before", DROP COLUMN "qty_sold_before", DROP COLUMN "qty_showroom_after", DROP COLUMN "qty_storage1_after", DROP COLUMN "qty_storage2_after", DROP COLUMN "qty_sold_after"`);
        await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "qty_showroom", DROP COLUMN "qty_storage1", DROP COLUMN "qty_storage2"`);

        await queryRunner.query(`CREATE TABLE "number_sequences" ("scope" character varying(100) NOT NULL, "next_value" integer NOT NULL, CONSTRAINT "PK_number_sequences" PRIMARY KEY ("scope"))`);

        // Adjustment reason becomes an enum; migrate the legacy 'New Arrival' string.
        await queryRunner.query(`CREATE TYPE "public"."transactions_adjustment_reason_enum" AS ENUM('NewArrival', 'Damage', 'CountCorrection', 'CustomerReturn', 'SupplierReturn')`);
        await queryRunner.query(`UPDATE "transactions" SET "adjustment_reason" = 'NewArrival' WHERE "adjustment_reason" = 'New Arrival'`);
        await queryRunner.query(`UPDATE "transactions" SET "adjustment_reason" = 'CustomerReturn' WHERE "adjustment_reason" = 'Customer Return'`);
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "adjustment_reason" TYPE "public"."transactions_adjustment_reason_enum" USING "adjustment_reason"::"public"."transactions_adjustment_reason_enum"`);

        await queryRunner.query(`CREATE INDEX "IDX_transactions_item_id" ON "transactions" ("item_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_transactions_date" ON "transactions" ("transaction_date")`);
        await queryRunner.query(`CREATE INDEX "IDX_quotation_details_quotation_id" ON "quotation_details" ("quotation_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("created_at")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "transactions" ALTER COLUMN "adjustment_reason" TYPE character varying(200) USING "adjustment_reason"::text`);
        await queryRunner.query(`DROP TYPE "public"."transactions_adjustment_reason_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_quotation_details_quotation_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_transactions_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_transactions_item_id"`);
        await queryRunner.query(`DROP TABLE "number_sequences"`);
        await queryRunner.query(`ALTER TABLE "items" ADD "qty_showroom" integer NOT NULL DEFAULT '0', ADD "qty_storage1" integer NOT NULL DEFAULT '0', ADD "qty_storage2" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "transactions" ADD "qty_showroom_before" integer, ADD "qty_storage1_before" integer, ADD "qty_storage2_before" integer, ADD "qty_sold_after" integer, ADD "qty_showroom_after" integer, ADD "qty_storage1_after" integer, ADD "qty_storage2_after" integer, ADD "qty_sold_before" integer`);
        await queryRunner.query(`UPDATE "transactions" SET
            "qty_showroom_before" = ("stock_before"->'1'->>'onHand')::integer,
            "qty_storage1_before" = ("stock_before"->'2'->>'onHand')::integer,
            "qty_storage2_before" = ("stock_before"->'3'->>'onHand')::integer,
            "qty_showroom_after"  = ("stock_after"->'1'->>'onHand')::integer,
            "qty_storage1_after"  = ("stock_after"->'2'->>'onHand')::integer,
            "qty_storage2_after"  = ("stock_after"->'3'->>'onHand')::integer`);
        await queryRunner.query(`ALTER TABLE "transactions" DROP COLUMN "stock_before", DROP COLUMN "stock_after"`);
        // Best-effort restore of the item columns from the stock rows.
        await queryRunner.query(`
            UPDATE "items" i SET
                "qty_showroom"  = COALESCE((SELECT s.qty_on_hand FROM "item_stocks" s JOIN "locations" l ON l.id = s.location_id WHERE s.item_id = i.id AND l.name = 'Showroom'), 0),
                "qty_storage1"  = COALESCE((SELECT s.qty_on_hand FROM "item_stocks" s JOIN "locations" l ON l.id = s.location_id WHERE s.item_id = i.id AND l.name = 'Storage 1'), 0),
                "qty_storage2"  = COALESCE((SELECT s.qty_on_hand FROM "item_stocks" s JOIN "locations" l ON l.id = s.location_id WHERE s.item_id = i.id AND l.name = 'Storage 2'), 0)
        `);
        await queryRunner.query(`DROP TABLE "item_stocks"`);
    }
}
