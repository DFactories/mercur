import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260728120000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "notification_read_state" ("id" text not null, "actor_type" text not null, "actor_id" text not null, "last_read_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "notification_read_state_pkey" primary key ("id"));`
    );
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_notification_read_state_actor_unique" ON "notification_read_state" ("actor_type", "actor_id") WHERE deleted_at IS NULL;`
    );
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_notification_read_state_deleted_at" ON "notification_read_state" ("deleted_at") WHERE deleted_at IS NULL;`
    );
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "notification_read_state" cascade;`);
  }
}
