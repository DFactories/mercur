import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260613120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" add column if not exists "phone_verified_at" timestamptz null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" drop column if exists "phone_verified_at";`
    );
  }
}
