import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * In-app notifications inbox (Phase 2C): per-user rows with a jsonb payload
 * and a read flag. The WS event is broadcast on create by NotificationsService.
 */
export class Notifications1733000000000 implements MigrationInterface {
  name = 'Notifications1733000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" SERIAL NOT NULL, "user_id" integer, "type" character varying(50) NOT NULL, "payload" jsonb, "read_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notifications" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_notifications_user"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_created"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
