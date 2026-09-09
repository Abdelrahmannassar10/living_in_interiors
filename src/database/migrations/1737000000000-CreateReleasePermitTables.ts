import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReleasePermitTables1737000000000
  implements MigrationInterface
{
  name = 'CreateReleasePermitTables1737000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."release_permits_status_enum" AS ENUM('Draft', 'Approved', 'Released', 'Cancelled')`,
    );
    await queryRunner.query(`CREATE TABLE "release_permits" (
      "id" SERIAL NOT NULL,
      "permit_no" character varying(50) NOT NULL,
      "permit_date" date NOT NULL DEFAULT ('now'::text)::date,
      "status" "public"."release_permits_status_enum" NOT NULL DEFAULT 'Draft',
      "notes" text,
      "internal_notes" text,
      "approved_at" TIMESTAMP,
      "released_at" TIMESTAMP,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "sales_order_id" integer NOT NULL,
      "approved_by" integer,
      "released_by" integer,
      "created_by" integer,
      CONSTRAINT "UQ_release_permits_permit_no" UNIQUE ("permit_no"),
      CONSTRAINT "PK_release_permits_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_release_permits_sales_order" ON "release_permits" ("sales_order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_release_permits_status" ON "release_permits" ("status")`,
    );
    await queryRunner.query(`CREATE TABLE "release_permit_lines" (
      "id" SERIAL NOT NULL,
      "qty" integer NOT NULL DEFAULT 1,
      "code_snapshot" character varying(100),
      "description_snapshot" character varying(500),
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "release_permit_id" integer NOT NULL,
      "sales_order_line_id" integer NOT NULL,
      "item_id" integer,
      CONSTRAINT "PK_release_permit_lines_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_release_permit_lines_permit" ON "release_permit_lines" ("release_permit_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" ADD CONSTRAINT "FK_release_permits_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" ADD CONSTRAINT "FK_release_permits_approved_by" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" ADD CONSTRAINT "FK_release_permits_released_by" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" ADD CONSTRAINT "FK_release_permits_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permit_lines" ADD CONSTRAINT "FK_release_permit_lines_permit" FOREIGN KEY ("release_permit_id") REFERENCES "release_permits"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permit_lines" ADD CONSTRAINT "FK_release_permit_lines_sales_order_line" FOREIGN KEY ("sales_order_line_id") REFERENCES "sales_order_lines"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permit_lines" ADD CONSTRAINT "FK_release_permit_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "release_permit_lines" DROP CONSTRAINT "FK_release_permit_lines_item"`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permit_lines" DROP CONSTRAINT "FK_release_permit_lines_sales_order_line"`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permit_lines" DROP CONSTRAINT "FK_release_permit_lines_permit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" DROP CONSTRAINT "FK_release_permits_created_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" DROP CONSTRAINT "FK_release_permits_released_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" DROP CONSTRAINT "FK_release_permits_approved_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "release_permits" DROP CONSTRAINT "FK_release_permits_sales_order"`,
    );
    await queryRunner.query(`DROP TABLE "release_permit_lines"`);
    await queryRunner.query(`DROP TABLE "release_permits"`);
    await queryRunner.query(
      `DROP TYPE "public"."release_permits_status_enum"`,
    );
  }
}
