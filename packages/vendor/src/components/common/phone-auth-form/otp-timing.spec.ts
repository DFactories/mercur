import fs from "fs"
import path from "path"

import { describe, expect, it } from "vitest"

/**
 * The OTP request route answers with BOTH clocks (`otpTiming` in
 * `@mercurjs/core`) precisely so no panel has to guess them — both are
 * env-configurable server-side, so a constant baked into a form is wrong the
 * first time an operator changes one, and wrong in the direction that promises
 * more time than the code has.
 *
 * The vendor login form did exactly that: a hardcoded 60-second resend counter
 * against a code that lives 120. A producer watched the counter run out and was
 * invited to request a new code while the one already in their hand was still
 * valid — and the number they were reading was never the code's lifetime at all.
 *
 * Asserted against the source text because the failure is a literal, not a
 * behaviour: any test that renders the form would happily pass while the
 * constant sat there unused-but-copied into the next form.
 */
const FORMS = [
  "packages/vendor/src/components/common/phone-auth-form/phone-auth-form.tsx",
  "packages/vendor/src/pages/settings/store/_components/store-phone-verification.tsx",
]

const repoRoot = path.resolve(__dirname, "../../../../../..")

describe("OTP countdowns in the vendor panel", () => {
  it.each(FORMS)("%s reads the cooldown off the response", (file) => {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8")
    expect(source).toContain("resend_in")
  })

  it.each(FORMS)("%s does not hardcode a 60-second cooldown", (file) => {
    const source = fs.readFileSync(path.join(repoRoot, file), "utf8")
    // A fallback constant is fine — it just must not contradict the server's
    // own default, which is the code's full lifetime.
    expect(source).not.toMatch(/RESEND_SECONDS\w*\s*=\s*60\b/)
  })
})
