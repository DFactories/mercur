import fs from "fs"
import path from "path"

import { describe, expect, it } from "vitest"

/**
 * `review` is the one table core does not exclusively own. Until 3fb2964d7
 * ("feat(reviews): admin reviews panel and core review module") reviews shipped
 * as a registry *block*: its module was copied into the consumer's own
 * `src/modules/reviews`, and the consumer generated the migration, so the name
 * differs per project and core cannot detect it. Promoting the capability into
 * core did not account for those projects — `Migration20260729120000` guards
 * its create with `if not exists`, so on a database that already has the
 * block's table the create is skipped in full and only columns carrying their
 * own defensive `alter` ever appear. `status` carried none: migrations reported
 * success and every query naming it failed afterwards instead.
 *
 * Hence the rule enforced here. Where a migration creates `review` behind an
 * `if not exists` guard, every column that CAN be added to a populated table —
 * nullable, defaulted, or serial — needs a defensive add somewhere in the
 * module's migrations. Columns declared `not null` with no default are exempt:
 * they cannot be back-filled onto existing rows at all, and the block's table
 * already had every one of them.
 */
const migrationsDir = path.join(__dirname, "migrations")

function migrationFiles(): string[] {
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => /^Migration\d+\.ts$/.test(f))
    .sort()
}

function migrationSql(): string {
  return migrationFiles()
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n")
}

function matchingParen(sql: string, open: number): number {
  let depth = 0
  for (let i = open; i < sql.length; i++) {
    if (sql[i] === "(") {
      depth++
    } else if (sql[i] === ")") {
      depth--
      if (depth === 0) {
        return i
      }
    }
  }
  return -1
}

/** Split a create-table body on the commas that separate definitions, not the
 * ones inside a `check (... in (...))`. */
function splitDefinitions(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const ch of body) {
    if (ch === "(") {
      depth++
    } else if (ch === ")") {
      depth--
    } else if (ch === "," && depth === 0) {
      parts.push(current)
      current = ""
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter(Boolean)
}

type Column = { name: string; definition: string }

function guardedCreateColumns(sql: string, table: string): Column[] | null {
  const start = sql.indexOf(`create table if not exists "${table}" (`)
  if (start === -1) {
    return null
  }
  const open = sql.indexOf("(", start)
  const close = matchingParen(sql, open)
  if (close === -1) {
    return null
  }
  const columns: Column[] = []
  for (const definition of splitDefinitions(sql.slice(open + 1, close))) {
    const named = /^"([a-z_0-9]+)"\s+(.+)$/is.exec(definition)
    if (!named) {
      continue // table-level constraint, not a column
    }
    columns.push({ name: named[1], definition: named[2] })
  }
  return columns
}

/** Postgres refuses a `not null` column with no default on a table that has
 * rows, so those are the only ones a defensive add cannot rescue. */
function canBeAddedToPopulatedTable(definition: string): boolean {
  const d = definition.toLowerCase()
  return (
    /\bserial\b/.test(d) || /\bdefault\b/.test(d) || !/\bnot\s+null\b/.test(d)
  )
}

function hasDefensiveAdd(sql: string, column: string): boolean {
  return new RegExp(`add column if not exists\\s+"${column}"`, "i").test(sql)
}

describe("review module migrations", () => {
  const sql = migrationSql()

  it("ships migrations (guards against a broken glob)", () => {
    expect(migrationFiles().length).toBeGreaterThan(0)
  })

  it("creates the review table behind an `if not exists` guard", () => {
    // If this ever stops holding, the rule below no longer applies and this
    // spec should be revisited rather than deleted.
    expect(guardedCreateColumns(sql, "review")).not.toBeNull()
  })

  it("defensively adds every column a pre-existing review table could lack", () => {
    const columns = guardedCreateColumns(sql, "review") ?? []
    const uncovered = columns
      .filter((c) => canBeAddedToPopulatedTable(c.definition))
      .filter((c) => !hasDefensiveAdd(sql, c.name))
      .map((c) => c.name)

    expect(uncovered).toEqual([])
  })
})
