import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260614120000 extends Migration {
  override async up(): Promise<void> {
    // Store email becomes optional (phone can be the primary store contact).
    // The existing unique index on email keeps enforcing uniqueness for
    // non-null values — Postgres treats NULLs as distinct, so multiple
    // email-less stores are allowed.
    this.addSql(
      `alter table if exists "seller" alter column "email" drop not null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "seller" alter column "email" set not null;`
    );
  }
}
