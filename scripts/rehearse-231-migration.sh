#!/usr/bin/env bash
set -euo pipefail

# Phase 5: rehearse the 2.3.1 migration against a CLONE of production.
#
# Never point this at production. It takes a database URL, records what is there,
# migrates it, and reports what changed and how long it took -- the two things
# that decide the maintenance window.
#
#   ./scripts/rehearse-231-migration.sh postgres://user@host:5432/prod_clone

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "usage: $0 <database-url-of-a-CLONE>" >&2
  exit 2
fi

case "$DB_URL" in
  *prod|*production|*_prod) 
    echo "REFUSING: that URL looks like production itself, not a clone." >&2
    exit 1 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
q() { psql "$DB_URL" -Atc "$1"; }

# `SELECT count(*) FROM t` fails to parse when t is absent, even guarded by
# to_regclass -- Postgres plans both branches. So ask whether it exists first.
count_of() {
  local t="$1"
  if [[ "$(q "SELECT to_regclass('\"$t\"') IS NOT NULL;")" == "t" ]]; then
    q "SELECT count(*) FROM \"$t\";"
  else
    echo "absent"
  fi
}

echo "=== BEFORE ==="
echo "  postgres            : $(q 'SHOW server_version;')"
echo "  size                : $(q "SELECT pg_size_pretty(pg_database_size(current_database()));")"
echo "  migrations recorded : $(q 'SELECT count(*) FROM mikro_orm_migrations;')"
for t in order order_line_item order_group product offer seller commission_line payout customer cart; do
  printf "  %-20s %s\n" "$t" "$(count_of "$t")"
done
BEFORE_ORDERS=$(count_of order)
BEFORE_ITEMS=$(count_of order_line_item)
BEFORE_COMM=$(count_of commission_line)
BEFORE_OFFERS=$(count_of offer)
BEFORE_SELLERS=$(count_of seller)

echo
echo "=== STEP 1: release the squatted migration name ==="
"$REPO_ROOT/scripts/release-squatted-migration-name.sh" "$DB_URL" || true

echo
echo "=== STEP 2: migrate (timed -- this is the maintenance window) ==="
START=$(date +%s)
(cd "$REPO_ROOT/apps/api" && DATABASE_URL="$DB_URL" node_modules/.bin/medusa db:migrate)
ELAPSED=$(( $(date +%s) - START ))
echo "  migration took ${ELAPSED}s"

echo
echo "=== STEP 3: verify ==="
FAIL=0
check() { # name expected actual
  if [[ "$2" == "$3" ]]; then printf "  ok    %-34s %s\n" "$1" "$3"
  else printf "  FAIL  %-34s expected %s, got %s\n" "$1" "$2" "$3"; FAIL=1; fi
}
check "orders preserved"        "$BEFORE_ORDERS"  "$(count_of order)"
check "order items preserved"   "$BEFORE_ITEMS"   "$(count_of order_line_item)"
check "commission lines intact" "$BEFORE_COMM"    "$(count_of commission_line)"
check "offers preserved"        "$BEFORE_OFFERS"  "$(count_of offer)"
check "sellers preserved"       "$BEFORE_SELLERS" "$(count_of seller)"
check "tax-line columns"        "4" "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name IN ('order_line_item_tax_line','order_shipping_method_tax_line') AND column_name IN ('metadata','data');")"
check "offer columns"           "2" "$(q "SELECT count(*) FROM information_schema.columns WHERE table_name='offer' AND column_name IN ('manage_inventory','allow_backorder');")"
check "new module tables"       "2" "$(q "SELECT count(*) FROM pg_tables WHERE tablename IN ('review','promotion_cost');")"
check "our own table intact"    "1" "$(q "SELECT count(*) FROM pg_tables WHERE tablename='shipping_option_type_delivery';")"

echo
if [[ "$FAIL" == "0" ]]; then
  echo "REHEARSAL PASSED in ${ELAPSED}s. Size the maintenance window off that number,"
  echo "and remember it scales with data volume -- the clone must be a recent one."
else
  echo "REHEARSAL FAILED. Do not migrate production." >&2
  exit 1
fi
