import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260625090000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "shipping_option_type_delivery" ("id" text not null, "shipping_option_type_id" text not null, "estimated_delivery_days" integer null, "carrier" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "shipping_option_type_delivery_pkey" primary key ("id"));`
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sotype_delivery_type_id" ON "shipping_option_type_delivery" ("shipping_option_type_id") WHERE deleted_at IS NULL;`
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_sotype_delivery_deleted_at" ON "shipping_option_type_delivery" (deleted_at) WHERE deleted_at IS NULL;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "shipping_option_type_delivery";`)
  }
}
