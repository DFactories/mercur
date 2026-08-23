import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Reviews shipped as a registry block before 3fb2964d7 promoted them into core,
 * and that block copied its module into the consumer's own `src/modules/reviews`
 * where the migration was generated per project — so core cannot recognise
 * those tables by migration name. `Migration20260729120000` guards its create
 * with `if not exists`, which means such a database skips the create entirely
 * and keeps only what a later `alter` adds. `display_id` had one; nothing else
 * did, so `db:migrate` reported success on a table still missing `status`.
 */
export class Migration20260823041742 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "review" add column if not exists "customer_note" text null;`
    )
    this.addSql(
      `alter table if exists "review" add column if not exists "seller_note" text null;`
    )
    this.addSql(
      `alter table if exists "review" add column if not exists "created_at" timestamptz not null default now();`
    )
    this.addSql(
      `alter table if exists "review" add column if not exists "updated_at" timestamptz not null default now();`
    )
    this.addSql(
      `alter table if exists "review" add column if not exists "deleted_at" timestamptz null;`
    )

    // `status` needs the surrounding branch rather than a bare defensive add. A
    // review stored before the column existed was unconditionally visible, so
    // letting it settle on the 'pending' default would retroactively unpublish
    // real customer content. Publishing is only the right reading where the
    // column was genuinely absent, which is why the back-fill sits inside that
    // test — an installation that already had `status` keeps its own pending
    // reviews pending.
    this.addSql(`
      do $$
      begin
        if to_regclass('review') is not null and not exists (
          select 1
          from information_schema.columns
          where table_schema = current_schema()
            and table_name = 'review'
            and column_name = 'status'
        ) then
          alter table "review"
            add column if not exists "status" text
              check ("status" in ('pending', 'published', 'rejected'))
              not null default 'pending';

          update "review" set "status" = 'published';
        end if;
      end $$;
    `)
  }

  override async down(): Promise<void> {
    // Every statement above is a no-op on a database whose `review` table this
    // module created, so there is nothing to reverse that would not instead
    // drop columns Migration20260729120000 owns.
  }
}
