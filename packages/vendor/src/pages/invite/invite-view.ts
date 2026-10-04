/**
 * Which form the invite page shows for a decoded token.
 *
 * Every invite this marketplace sends is addressed to a phone — the admin and
 * vendor invite forms take nothing else — yet the page only knew upstream's
 * email-and-password form, which a phone invitee cannot fill: there is no email
 * on the invite and no password on any account here. So a phone token gets the
 * OTP form, and signing in with the invited number is what accepts it (the
 * server accepts a phone's pending invites on every verification).
 *
 * A token past its `exp` is said to be expired up front, instead of letting
 * the visitor sign in and land in onboarding with the invite silently skipped.
 */
export type InviteView = "invalid" | "expired" | "phone" | "email"

type DecodedLike = {
  id?: unknown
  jti?: unknown
  exp?: unknown
  iat?: unknown
  email?: string | null
  phone?: string | null
}

export const inviteView = (
  decoded: DecodedLike | null,
  now: number = Date.now()
): InviteView => {
  if (
    !decoded ||
    typeof decoded.id !== "string" ||
    typeof decoded.jti !== "string" ||
    typeof decoded.exp !== "number" ||
    typeof decoded.iat !== "number"
  ) {
    return "invalid"
  }
  if (decoded.exp * 1000 <= now) {
    return "expired"
  }
  return decoded.phone ? "phone" : "email"
}
