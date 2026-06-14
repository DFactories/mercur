import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260614130000 extends Migration {
  override async up(): Promise<void> {
    // #6 member avatar
    this.addSql(
      `alter table if exists "member" add column if not exists "photo" text null;`
    );
    // #7 store documents
    this.addSql(
      `alter table if exists "professional_details" add column if not exists "business_license" text null;`
    );
    this.addSql(
      `alter table if exists "professional_details" add column if not exists "health_permit" text null;`
    );
    // #1 phone invites
    this.addSql(
      `alter table if exists "member_invite" add column if not exists "phone" text null;`
    );
    this.addSql(
      `alter table if exists "member_invite" alter column "email" drop not null;`
    );
    this.addSql(
      `create unique index if not exists "IDX_member_invite_phone_seller_unique" on "member_invite" ("phone", "seller_id") where deleted_at is null and accepted = false and phone is not null;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_member_invite_phone_seller_unique";`
    );
    this.addSql(
      `alter table if exists "member_invite" drop column if exists "phone";`
    );
    this.addSql(
      `alter table if exists "professional_details" drop column if exists "health_permit";`
    );
    this.addSql(
      `alter table if exists "professional_details" drop column if exists "business_license";`
    );
    this.addSql(`alter table if exists "member" drop column if exists "photo";`);
  }
}
