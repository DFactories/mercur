import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20261004000000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `CREATE TABLE IF NOT EXISTS "offer_draft" ("id" text NOT NULL, "seller_id" text NOT NULL, "product_id" text NOT NULL, "variant_id" text NULL, "external_id" text NULL, "status" text CHECK ("status" IN ('open', 'completed')) NOT NULL DEFAULT 'open', "completed_offer_id" text NULL, "completed_at" timestamptz NULL, "created_by" text NULL, "metadata" jsonb NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), "deleted_at" timestamptz NULL, CONSTRAINT "offer_draft_pkey" PRIMARY KEY ("id"));`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_offer_draft_deleted_at" ON "offer_draft" ("deleted_at") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_offer_draft_seller_id" ON "offer_draft" ("seller_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE INDEX IF NOT EXISTS "IDX_offer_draft_product_id" ON "offer_draft" ("product_id") WHERE deleted_at IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_offer_draft_external_variant_unique" ON "offer_draft" ("external_id", "variant_id") WHERE deleted_at IS NULL AND external_id IS NOT NULL AND variant_id IS NOT NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_offer_draft_external_product_unique" ON "offer_draft" ("external_id") WHERE deleted_at IS NULL AND external_id IS NOT NULL AND variant_id IS NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_offer_draft_open_seller_variant_unique" ON "offer_draft" ("seller_id", "variant_id") WHERE deleted_at IS NULL AND status = 'open' AND variant_id IS NOT NULL;`,
    )
    this.addSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_offer_draft_open_seller_product_unique" ON "offer_draft" ("seller_id", "product_id") WHERE deleted_at IS NULL AND status = 'open' AND variant_id IS NULL;`,
    )
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TABLE IF EXISTS "offer_draft" CASCADE;`)
  }
}
