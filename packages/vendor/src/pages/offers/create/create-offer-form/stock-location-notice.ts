/**
 * The stock grid has one column per stock location the store has, and nothing
 * else. A store with none — every store until it creates a warehouse, including
 * one an operator is completing offer drafts for — got a grid with prices and
 * no stock column at all: no error, no hint, just nowhere to type a quantity
 * (reported from production 2026-10-04). The offer still saved, with no stock.
 *
 * So the tab says why and links to where a location is made. It waits for the
 * list to load, or every store would see the notice flash on open.
 */
export const STOCK_LOCATION_CREATE_PATH = "/settings/locations/create"

export const needsStockLocation = (
  locations: readonly unknown[] | undefined,
  isPending: boolean
): boolean => !isPending && (locations?.length ?? 0) === 0
