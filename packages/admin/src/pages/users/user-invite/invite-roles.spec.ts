import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const FORM = join(
  __dirname,
  "components/invite-user-form/invite-user-form.tsx"
)

/**
 * An admin invite must carry a role.
 *
 * ## The bug
 *
 * Reported by a user testing RBAC enforcement. They invited an admin, the
 * admin signed in, and the panel showed an error page. This form sent only
 * `{ email }`, so `acceptInviteWorkflow` read no roles off the invite and
 * created a user with none — and once policies are declared, an admin with no
 * role is refused by every admin route, including the store lookup the shell
 * itself performs.
 *
 * The server refuses such an invite now too, in dfactories-mp. This form is
 * what makes that refusal avoidable rather than a dead end: without a picker,
 * the guard would simply make the panel's invite feature unusable.
 *
 * ## Source assertions, and why
 *
 * This package has no DOM test setup, and adding one to a published package
 * for a form field is out of proportion. What must not regress is narrow: the
 * role reaches the request, it is required by the schema, and the list comes
 * from the ASSIGNABLE endpoint rather than every role that exists.
 */
describe("the admin invite form", () => {
  const source = readFileSync(FORM, "utf8")

  it("sends roles with the invite", () => {
    // `mutateAsync({ email: values.email })` — the shape that created a
    // locked-out admin.
    expect(source).not.toMatch(/mutateAsync\(\{\s*email:\s*values\.email\s*\}\)/)
    expect(source).toMatch(/roles:\s*\[values\.role_id\]/)
  })

  it("requires a role rather than allowing an empty one", () => {
    // `.min(1)` is what turns the picker into a requirement; without it the
    // form submits "" and the server's guard rejects it, which is a worse
    // experience than being asked up front.
    expect(source).toMatch(/role_id:\s*zod\.string\(\)\.min\(1\)/)
  })

  it("offers only roles this admin may actually grant", () => {
    // /assignable is scoped server-side to roles whose policies the actor
    // holds. Listing every role would offer a super-admin role to someone who
    // would then be refused on submit, and disclose roles they should not see.
    expect(source).toMatch(/useAssignableRoles/)
    expect(source).not.toMatch(/useRoles\b/)
  })

  it("labels the field from the locale files, not a literal", () => {
    // The panel is Persian-first; an English literal here would render in
    // English to every operator.
    expect(source).toMatch(/t\("fields\.role"\)/)
  })
})
