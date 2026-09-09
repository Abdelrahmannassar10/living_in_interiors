import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRfqTables1736000000000 implements MigrationInterface {
  name = 'CreateRfqTables1736000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."rfqs_status_enum" AS ENUM('Draft', 'Sent', 'Received', 'Awarded', 'Cancelled')`,
    );
    await queryRunner.query(`CREATE TABLE "rfqs" (
      "id" SERIAL NOT NULL,
      "rfq_no" character varying(50) NOT NULL,
      "rfq_date" date NOT NULL DEFAULT ('now'::text)::date,
      "client_name" character varying(200),
      "contact_person" character varying(200),
      "phone" character varying(50),
      "email" character varying(200),
      "status" "public"."rfqs_status_enum" NOT NULL DEFAULT 'Draft',
      "valid_until" date,
      "notes" text,
      "internal_notes" text,
      "currency" character varying(10) NOT NULL DEFAULT 'USD',
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "supplier_id" integer,
      "client_id" integer,
      "created_by" integer,
      CONSTRAINT "UQ_rfqs_rfq_no" UNIQUE ("rfq_no"),
      CONSTRAINT "PK_rfqs_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_rfqs_supplier" ON "rfqs" ("supplier_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rfqs_client" ON "rfqs" ("client_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rfqs_status" ON "rfqs" ("status")`,
    );
    await queryRunner.query(`CREATE TABLE "rfq_lines" (
      "id" SERIAL NOT NULL,
      "sort_order" integer NOT NULL DEFAULT 0,
      "qty" integer NOT NULL DEFAULT 1,
      "description" text,
      "unit_price" numeric(12,2),
      "lead_time_days" integer,
      "code_snapshot" character varying(100),
      "description_snapshot" character varying(500),
      "is_deleted" boolean NOT NULL DEFAULT false,
      "created_at" TIMESTAMP NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
      "rfq_id" integer NOT NULL,
      "item_id" integer,
      CONSTRAINT "PK_rfq_lines_id" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_rfq_lines_rfq" ON "rfq_lines" ("rfq_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "rfqs" ADD CONSTRAINT "FK_rfqs_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rfqs" ADD CONSTRAINT "FK_rfqs_client" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rfqs" ADD CONSTRAINT "FK_rfqs_created_by" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "rfq_lines" ADD CONSTRAINT "FK_rfq_lines_rfq" FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "rfq_lines" ADD CONSTRAINT "FK_rfq_lines_item" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "rfq_lines" DROP CONSTRAINT "FK_rfq_lines_item"`);
    await queryRunner.query(`ALTER TABLE "rfq_lines" DROP CONSTRAINT "FK_rfq_lines_rfq"`);
    await queryRunner.query(`ALTER TABLE "rfqs" DROP CONSTRAINT "FK_rfqs_created_by"`);
    await queryRunner.query(`ALTER TABLE "rfqs" DROP CONSTRAINT "FK_rfqs_client"`);
    await queryRunner.query(`ALTER TABLE "rfqs" DROP CONSTRAINT "FK_rfqs_supplier"`);
    await queryRunner.query(`DROP TABLE "rfq_lines"`);
    await queryRunner.query(`DROP TABLE "rfqs"`);
    await queryRunner.query(`DROP TYPE "public"."rfqs_status_enum"`);
  }
}
