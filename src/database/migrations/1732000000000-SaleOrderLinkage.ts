import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sale ↔ order linkage (Phase 2B final): lets a Sale record reference the
 * confirmed sales order whose reserved stock it consumes. Plain integer column
 * + FK (the transactions table stays a lightweight immutable ledger).
 */
export class SaleOrderLinkage1732000000000 implements MigrationInterface {
  name = 'SaleOrderLinkage1732000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD COLUMN "sales_order_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" ADD CONSTRAINT "FK_transactions_sales_order" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_sales_order"`,
    );
    await queryRunner.query(
      `ALTER TABLE "transactions" DROP COLUMN "sales_order_id"`,
    );
  }
}
