import { describe, expect, it, vi } from "vitest"

import { ensureSellerMiddleware } from "./ensure-seller-middleware"

/**
 * An owner is never role-restricted.
 *
 * Ownership and role are assigned independently: both invite-acceptance paths
 * write `is_owner: owners.length === 0` alongside `role_id: invite.role_id`.
 * So the first person invited to a store with no owner yet becomes the owner
 * carrying whatever role the invite happened to name — and a store created by
 * an operator and handed over later is exactly that shape.
 *
 * Every other part of the codebase treats the owner as a bypass:
 * `validate-not-owner` refuses to change their role, `validate-remove-seller-
 * member` refuses to remove their seat, `memberCanPerform` opens with
 * `if (member.is_owner) return true`. Only the RBAC role list disagreed, which
 * meant an owner invited as anything but Seller Administration owned a store
 * whose policy-guarded settings they could not open — and could not fix,
 * because their role cannot be changed.
 *
 * It stayed survivable only because `POST /vendor/sellers/me` declared no
 * policy and the panel calls `/me`. Guarding that route without this would
 * have turned the inconsistency into a lockout.
 */

const invoke = async (sellerMember: {
  role_id: string | null
  is_owner: boolean
}) => {
  const req = {
    get: () => "sel_1",
    session: {},
    auth_context: { actor_id: "mem_1", app_metadata: {} as Record<string, unknown> },
    scope: {
      resolve: (key: string) => {
        if (key === "query") {
          return {
            graph: async () => ({
              data: [
                {
                  id: "selmem_1",
                  seller_id: "sel_1",
                  member_id: "mem_1",
                  ...sellerMember,
                  seller: { currency_code: "irr" },
                },
              ],
            }),
          }
        }
        if (key === "rbac") {
          return {
            listRbacRoles: async () => [],
            createRbacRoles: async (r: unknown[]) => r,
            listRbacPolicies: async () => [],
            listRbacRolePolicies: async () => [],
            createRbacRolePolicies: async () => [],
          }
        }
        throw new Error(`unexpected resolve(${key})`)
      },
    },
  }

  const next = vi.fn()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ensureSellerMiddleware(req as any, {} as any, next)

  return { next, roles: req.auth_context.app_metadata.roles as string[] | undefined }
}

describe("ensureSellerMiddleware", () => {
  it("gives an owner administration policies whatever their role says", async () => {
    // The regression: an owner invited as Inventory Management. Before the fix
    // this produced ["role_seller_inventory_management"], which is bound to no
    // policies at all — so every policy-guarded route refused the owner of the
    // store.
    const { next, roles } = await invoke({
      role_id: "role_seller_inventory_management",
      is_owner: true,
    })

    expect(next).toHaveBeenCalledWith()
    expect(roles).toEqual(["role_seller_administration"])
  })

  it("gives an owner administration policies even with no role at all", async () => {
    // A seat with a null role otherwise sets no roles, and an empty role list
    // is treated as "unrestricted" by hasPermission — fail-open. For an owner
    // the outcome is the same either way, but saying it explicitly means the
    // owner's access does not depend on that quirk.
    const { roles } = await invoke({ role_id: null, is_owner: true })

    expect(roles).toEqual(["role_seller_administration"])
  })

  it("leaves a non-owner on their own role", async () => {
    // The whole point of roles. Widening the owner bypass must not widen this.
    const { roles } = await invoke({
      role_id: "role_seller_inventory_management",
      is_owner: false,
    })

    expect(roles).toEqual(["role_seller_inventory_management"])
  })

  it("refuses a member who does not belong to the seller", async () => {
    const req = {
      get: () => "sel_1",
      session: {},
      auth_context: { actor_id: "mem_other", app_metadata: {} },
      scope: {
        resolve: (key: string) =>
          key === "query"
            ? { graph: async () => ({ data: [] }) }
            : (() => {
                throw new Error(`unexpected resolve(${key})`)
              })(),
      },
    }
    const next = vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ensureSellerMiddleware(req as any, {} as any, next)

    expect(next.mock.calls[0][0]).toBeInstanceOf(Error)
  })
})
