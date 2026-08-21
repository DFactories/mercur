import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260612090002 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "notification_channel_config" ("id" text not null, "event_key" text not null, "channel" text not null, "enabled" boolean not null default false, "template_id" text null, "params_map" jsonb null, "subject" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "notification_channel_config_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notification_channel_config_event_channel_unique" ON "notification_channel_config" ("event_key", "channel") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_channel_config_deleted_at" ON "notification_channel_config" ("deleted_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "notification_channel_config" cascade;`);
  }
}
