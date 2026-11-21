import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261122090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "otp_verify_failure" ("id" text not null, "ip" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "otp_verify_failure_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_otp_verify_failure_ip_created_at" ON "otp_verify_failure" ("ip", "created_at") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_otp_verify_failure_deleted_at" ON "otp_verify_failure" ("deleted_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "otp_verify_failure" cascade;`);
  }
}
