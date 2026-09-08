import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAllTables1787486188500 implements MigrationInterface {
  name = 'CreateAllTables1787486188500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('Admin', 'Manager', 'Staff', 'Viewer')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" SERIAL NOT NULL, "username" character varying(100) NOT NULL, "password" character varying(255) NOT NULL, "full_name" character varying(200) NOT NULL, "role" "public"."users_role_enum" NOT NULL DEFAULT 'Staff', "is_active" boolean NOT NULL DEFAULT true, "refresh_token" character varying(500), "last_login_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "brands" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, "country" character varying(100), "logo_url" character varying(500), "website" character varying(300), "notes" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" integer, CONSTRAINT "UQ_96db6bbbaa6f23cad26871339b6" UNIQUE ("name"), CONSTRAINT "PK_b0c437120b624da1034a81fc561" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "item_photos" ("id" SERIAL NOT NULL, "file_name" character varying(500) NOT NULL, "public_id" character varying(1000) NOT NULL, "file_url" character varying(1000) NOT NULL, "thumbnail_url" character varying(1000), "file_size" integer, "mime_type" character varying(100), "is_primary" boolean NOT NULL DEFAULT false, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "item_id" integer, CONSTRAINT "PK_1694151a181c7e2d198b1c07545" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "items" ("id" SERIAL NOT NULL, "code" character varying(100) NOT NULL, "description" character varying(500), "dimension" character varying(200), "finish_fabric" character varying(200), "category" character varying(100), "sub_category" character varying(100), "initial_qty" integer NOT NULL DEFAULT '0', "qty_showroom" integer NOT NULL DEFAULT '0', "qty_storage1" integer NOT NULL DEFAULT '0', "qty_storage2" integer NOT NULL DEFAULT '0', "qty_sold" integer NOT NULL DEFAULT '0', "unit_price" numeric(12,2), "currency" character varying(10) NOT NULL DEFAULT 'USD', "low_stock_threshold" integer NOT NULL DEFAULT '1', "notes" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "brand_id" integer, "created_by" integer, CONSTRAINT "UQ_1b0a705ce0dc5430c020a0ec31f" UNIQUE ("code"), CONSTRAINT "PK_ba5885359424c15ca6b9e79bcf6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."locations_type_enum" AS ENUM('Showroom', 'Storage', 'Client', 'Transit')`,
    );
    await queryRunner.query(
      `CREATE TABLE "locations" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "type" "public"."locations_type_enum", "is_physical" boolean NOT NULL DEFAULT true, "notes" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_227023051ab1fedef7a3b6c7e2a" UNIQUE ("name"), CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_transaction_type_enum" AS ENUM('Transfer', 'Sale', 'Return', 'Adjustment')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transactions_adjustment_type_enum" AS ENUM('Increase', 'Decrease')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transactions" ("id" SERIAL NOT NULL, "transaction_date" TIMESTAMP NOT NULL DEFAULT now(), "transaction_type" "public"."transactions_transaction_type_enum" NOT NULL, "adjustment_type" "public"."transactions_adjustment_type_enum", "adjustment_reason" character varying(200), "qty" integer NOT NULL, "customer_name" character varying(200), "reference_no" character varying(100), "notes" text, "qty_showroom_before" integer, "qty_storage1_before" integer, "qty_storage2_before" integer, "qty_sold_before" integer, "qty_showroom_after" integer, "qty_storage1_after" integer, "qty_storage2_after" integer, "qty_sold_after" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "item_id" integer, "from_location_id" integer, "to_location_id" integer, "created_by" integer, CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "stock_alert_configs" ("id" SERIAL NOT NULL, "threshold" integer NOT NULL DEFAULT '1', "is_enabled" boolean NOT NULL DEFAULT true, "last_alerted_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "item_id" integer, CONSTRAINT "REL_b495a5facd8487b14e86a871c3" UNIQUE ("item_id"), CONSTRAINT "PK_94fe27af85fdf52e38686cc558f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "suppliers" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, "contact_person" character varying(200), "phone" character varying(50), "email" character varying(200), "website" character varying(300), "country" character varying(100), "payment_terms" character varying(200), "notes" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "brand_id" integer, "created_by" integer, CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "clients" ("id" SERIAL NOT NULL, "name" character varying(200) NOT NULL, "type" character varying(50) NOT NULL DEFAULT 'Individual', "contact_person" character varying(200), "phone" character varying(50), "email" character varying(200), "address" text, "city" character varying(100), "country" character varying(100) NOT NULL DEFAULT 'Egypt', "notes" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "created_by" integer, CONSTRAINT "PK_f1ab7cf3a5714dbc6bb4e1c28a4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "quotation_details" ("id" SERIAL NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "brand_snapshot" character varying(200), "code_snapshot" character varying(100), "description_snapshot" character varying(500), "dimension_snapshot" character varying(200), "finish_fabric_snapshot" character varying(200), "photo_url_snapshot" character varying(1000), "qty" integer NOT NULL DEFAULT '1', "unit_price" numeric(12,2) NOT NULL, "currency" character varying(10) NOT NULL DEFAULT 'USD', "discount_percent" numeric(5,2) NOT NULL DEFAULT '0', "discount_amount" numeric(12,2) NOT NULL DEFAULT '0', "total_price" numeric(12,2) NOT NULL, "total_price_after_discount" numeric(12,2) NOT NULL, "notes" text, "is_deleted" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "quotation_id" integer, "item_id" integer, CONSTRAINT "PK_f5faae63247660701bce1dd4106" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."quotations_status_enum" AS ENUM('Draft', 'Sent', 'Approved', 'Rejected', 'Cancelled', 'Expired')`,
    );
    await queryRunner.query(
      `CREATE TABLE "quotations" ("id" SERIAL NOT NULL, "quote_no" character varying(50) NOT NULL, "quote_date" date NOT NULL DEFAULT ('now'::text)::date, "client_name" character varying(200), "project_name" character varying(200), "contact_person" character varying(200), "phone" character varying(50), "email" character varying(200), "notes" text, "internal_notes" text, "status" "public"."quotations_status_enum" NOT NULL DEFAULT 'Draft', "revision" integer NOT NULL DEFAULT '0', "valid_until" date, "discount_global" numeric(5,2) NOT NULL DEFAULT '0', "vat_percent" numeric(5,2) NOT NULL DEFAULT '0', "currency" character varying(10) NOT NULL DEFAULT 'USD', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "client_id" integer, "created_by" integer, CONSTRAINT "UQ_5750e17b7454d7252a13056b64c" UNIQUE ("quote_no"), CONSTRAINT "PK_6c00eb8ba181f28c21ffba7ecb1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "quotation_revisions" ("id" SERIAL NOT NULL, "revision_number" integer NOT NULL, "snapshot" jsonb NOT NULL, "changed_at" TIMESTAMP NOT NULL DEFAULT now(), "change_summary" text, "quotation_id" integer, "changed_by" integer, CONSTRAINT "PK_cc6e009d13bc441e3c207e0ef5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" BIGSERIAL NOT NULL, "user_id" integer, "user_name" character varying(200), "action" character varying(50) NOT NULL, "entity" character varying(100) NOT NULL, "entity_id" character varying(100), "old_values" jsonb, "new_values" jsonb, "changed_fields" text, "ip_address" character varying(50), "user_agent" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_82edbc5f8a1821ff01b8b9c865" ON "audit_logs" ("entity", "entity_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "brands" ADD CONSTRAINT "FK_43291261334c16b47ff227c09ff" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "item_photos" ADD CONSTRAINT "FK_230c81b221e78373a2fcf20753f" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "FK_6ed953a2c457e2e41a6893706a2" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" ADD CONSTRAINT "FK_25a958155bb9a9d741210749e07" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_698754e69f6b9bb4144a8330313" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_0f4077605acafda29a4349c48aa" FOREIGN KEY ("from_location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_40cf2aa2c54a1264cfd0e312099" FOREIGN KEY ("to_location_id") REFERENCES "locations"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_77e84561125adeccf287547f66e" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_alert_configs" ADD CONSTRAINT "FK_b495a5facd8487b14e86a871c36" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD CONSTRAINT "FK_9bced6d382e8092d7d130422d6c" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" ADD CONSTRAINT "FK_4be40fae84ce82ed3baef4a49fa" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" ADD CONSTRAINT "FK_f48a5f46db8d13a0c8dad0a435d" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_details" ADD CONSTRAINT "FK_3b546c5d73429058bfc67dd9961" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_details" ADD CONSTRAINT "FK_866aa389e2b102a717c7b0a2739" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotations" ADD CONSTRAINT "FK_118e5246cab853e3c1d958732d8" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotations" ADD CONSTRAINT "FK_25dcb703da984fa66bde99af598" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_revisions" ADD CONSTRAINT "FK_c18c23bfd1d96e9ca9557420b5d" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_revisions" ADD CONSTRAINT "FK_e9dbcd0a41014c663929f514816" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "quotation_revisions" DROP CONSTRAINT "FK_e9dbcd0a41014c663929f514816"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_revisions" DROP CONSTRAINT "FK_c18c23bfd1d96e9ca9557420b5d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotations" DROP CONSTRAINT "FK_25dcb703da984fa66bde99af598"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotations" DROP CONSTRAINT "FK_118e5246cab853e3c1d958732d8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_details" DROP CONSTRAINT "FK_866aa389e2b102a717c7b0a2739"`,
    );
    await queryRunner.query(
      `ALTER TABLE "quotation_details" DROP CONSTRAINT "FK_3b546c5d73429058bfc67dd9961"`,
    );
    await queryRunner.query(
      `ALTER TABLE "clients" DROP CONSTRAINT "FK_f48a5f46db8d13a0c8dad0a435d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP CONSTRAINT "FK_4be40fae84ce82ed3baef4a49fa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "suppliers" DROP CONSTRAINT "FK_9bced6d382e8092d7d130422d6c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "stock_alert_configs" DROP CONSTRAINT "FK_b495a5facd8487b14e86a871c36"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_77e84561125adeccf287547f66e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_40cf2aa2c54a1264cfd0e312099"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_0f4077605acafda29a4349c48aa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_698754e69f6b9bb4144a8330313"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT "FK_25a958155bb9a9d741210749e07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "items" DROP CONSTRAINT "FK_6ed953a2c457e2e41a6893706a2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "item_photos" DROP CONSTRAINT "FK_230c81b221e78373a2fcf20753f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "brands" DROP CONSTRAINT "FK_43291261334c16b47ff227c09ff"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_82edbc5f8a1821ff01b8b9c865"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "quotation_revisions"`);
    await queryRunner.query(`DROP TABLE "quotations"`);
    await queryRunner.query(`DROP TYPE "public"."quotations_status_enum"`);
    await queryRunner.query(`DROP TABLE "quotation_details"`);
    await queryRunner.query(`DROP TABLE "clients"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`DROP TABLE "stock_alert_configs"`);
    await queryRunner.query(`DROP TABLE "transactions"`);
    await queryRunner.query(
      `DROP TYPE "public"."transactions_adjustment_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."transactions_transaction_type_enum"`,
    );
    await queryRunner.query(`DROP TABLE "locations"`);
    await queryRunner.query(`DROP TYPE "public"."locations_type_enum"`);
    await queryRunner.query(`DROP TABLE "items"`);
    await queryRunner.query(`DROP TABLE "item_photos"`);
    await queryRunner.query(`DROP TABLE "brands"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
  }
}
