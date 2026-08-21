#!/usr/bin/env bash
set -euo pipefail

# Run this against a database BEFORE `medusa db:migrate` when upgrading it to
# Mercur 2.3.1 / Medusa 2.18.
#
# Medusa keys every module's migrations by class name in one shared
# `mikro_orm_migrations` table -- the owning module is not part of the key. Our
# `shipping-option-type-delivery` module used to ship `Migration20260625000000`,
# the same name Medusa 2.18's order module uses to add `metadata`/`data` to
# `order_line_item_tax_line` and `order_shipping_method_tax_line`.
#
# On any database that ran the old name, Medusa's migration is treated as already
# executed and is skipped. `db:migrate` still exits 0. Nothing warns. The columns
# are simply never created, and every cart completion then fails with
# `column t5.metadata does not exist`.
#
# Renaming our migration fixes new databases. It does NOT fix an existing one --
# the stale row is still there. This releases the name so Medusa's real migration
# can run. Both migrations are idempotent, so this is safe to repeat.

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 <database-url>   (or set DATABASE_URL)" >&2
  exit 2
fi

STALE_NAME="Migration20260625000000"

q() { psql "$DB_URL" -Atc "$1"; }

recorded=$(q "SELECT count(*) FROM mikro_orm_migrations WHERE name = '$STALE_NAME';")
columns=$(q "SELECT count(*) FROM information_schema.columns
             WHERE table_name IN ('order_line_item_tax_line','order_shipping_method_tax_line')
               AND column_name IN ('metadata','data');")
ours=$(q "SELECT count(*) FROM pg_tables WHERE tablename = 'shipping_option_type_delivery';")

echo "  $STALE_NAME recorded : $recorded"
echo "  tax-line columns present : $columns / 4"
echo "  shipping_option_type_delivery table : $ours"

if [[ "$columns" == "4" ]]; then
  echo "OK: the tax-line columns already exist; nothing to do."
  exit 0
fi

if [[ "$recorded" == "0" ]]; then
  echo "OK: the name is not squatted. The missing columns are a different problem --" >&2
  echo "    do NOT paper over it here; investigate before migrating." >&2
  exit 1
fi

if [[ "$ours" != "1" ]]; then
  echo "REFUSING: '$STALE_NAME' is recorded but our shipping_option_type_delivery" >&2
  echo "    table is absent, so that row may not be ours. Investigate by hand." >&2
  exit 1
fi

echo "Releasing the name so Medusa's order migration can run..."
q "DELETE FROM mikro_orm_migrations WHERE name = '$STALE_NAME';" >/dev/null
echo "Done. Now run: medusa db:migrate"
echo "Afterwards, all four tax-line columns must exist -- re-run this script to confirm."
