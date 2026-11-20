import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261120090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "otp_code" add column if not exists "ip" text null;`);
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_otp_code_created_at" ON "otp_code" ("created_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_otp_code_created_at";`);
    this.addSql(`alter table if exists "otp_code" drop column if exists "ip";`);
  }
}
