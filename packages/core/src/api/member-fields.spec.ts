import { describe, expect, it } from "vitest"

import { adminMemberListQueryConfig } from "./admin/members/query-config"
import { adminMembersQueryConfig } from "./admin/sellers/query-config"
import {
  listVendorMembersQueryConfig,
  retrieveVendorMemberQueryConfig,
} from "./vendor/sellers/query-config"

/**
 * The fields a panel reads must be fields the API returns.
 *
 * `query.graph` returns exactly the selection it is given, so a field missing
 * from a route's `defaults` arrives as `undefined` — not as an error. Every
 * consumer then behaves as though the value were simply absent, and the
 * failure is silent by construction. Three of these shipped at once:
 *
 *  - `/admin/members` omitted `phone`, so the admin team form — which looks a
 *    member up by phone and adds them to the store directly — matched nobody,
 *    ever, and silently fell through to sending an invite instead. The "add an
 *    existing member" path it was written for was unreachable from day one.
 *  - `/admin/sellers/:id/members` omitted `member_id`, so the same form's
 *    "already on this team?" guard saw an empty set and could not prevent a
 *    re-add, which then hit the `(seller_id, member_id)` unique index raw.
 *  - `/vendor/sellers/:id/members` omitted `role_id`, so the store's own team
 *    page rendered "-" in the Role column for every teammate — the one
 *    question that table exists to answer.
 *
 * Asserting on the imported config rather than on a regex over the source:
 * a test that greps has to assert its own match or it passes while checking
 * nothing.
 */

const contracts: {
  route: string
  defaults: readonly string[]
  reads: { field: string; consumer: string }[]
}[] = [
  {
    route: "GET /admin/members",
    defaults: adminMemberListQueryConfig.list.defaults,
    reads: [
      {
        field: "phone",
        consumer:
          "admin store-member-invite form — matches m.phone to add an existing member",
      },
    ],
  },
  {
    route: "GET /admin/sellers/:id/members",
    defaults: adminMembersQueryConfig.list.defaults,
    reads: [
      {
        field: "member_id",
        consumer:
          "admin store-member-invite form — builds the already-a-member guard",
      },
      {
        field: "role_id",
        consumer: "admin store-members table — Role column",
      },
    ],
  },
  {
    route: "GET /vendor/sellers/:id/members",
    defaults: listVendorMembersQueryConfig.defaults,
    reads: [
      {
        field: "role_id",
        consumer: "vendor team-list table — Role column",
      },
      {
        field: "member_id",
        consumer: "vendor team management — identifies the seat's member",
      },
    ],
  },
  {
    route: "GET /vendor/sellers/:id/members/:member_id",
    defaults: retrieveVendorMemberQueryConfig.defaults,
    reads: [
      { field: "role_id", consumer: "vendor team detail" },
      { field: "member_id", consumer: "vendor team detail" },
    ],
  },
]

describe.each(contracts)("$route", ({ defaults, reads }) => {
  it.each(reads)("returns `$field` — read by $consumer", ({ field }) => {
    expect(defaults).toContain(field)
  })

  it("selects the relation id explicitly, not only via the expanded object", () => {
    // `member.*` expands the relation but does NOT imply the `member_id`
    // scalar, and that difference is invisible until a consumer reads the flat
    // column and gets `undefined`.
    if (defaults.includes("member.*")) {
      expect(defaults).toContain("member_id")
    }
  })
})
