import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612090003 extends Migration {
  override async up(): Promise<void> {
    // Phone-primary identity: add nullable phone, make email nullable, and
    // scope the unique indexes to non-null values so both can be optional.
    this.addSql(
      `alter table if exists "member" add column if not exists "phone" text null;`
    );
    this.addSql(`alter table if exists "member" alter column "email" drop not null;`);
    this.addSql(`drop index if exists "IDX_member_email_unique";`);
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_member_email_unique" ON "member" ("email") WHERE deleted_at IS NULL AND email IS NOT NULL;`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_member_phone_unique" ON "member" ("phone") WHERE deleted_at IS NULL AND phone IS NOT NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_member_phone_unique";`);
    this.addSql(`drop index if exists "IDX_member_email_unique";`);
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_member_email_unique" ON "member" ("email") WHERE deleted_at IS NULL;`
    );
    this.addSql(`alter table if exists "member" drop column if exists "phone";`);
  }
}
