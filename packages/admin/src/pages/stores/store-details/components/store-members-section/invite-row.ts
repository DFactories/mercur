/**
 * How an unaccepted invite reads in a store's members table.
 *
 * An invite past `expires_at` can no longer be accepted — OTP sign-in skips it
 * and the token is refused — but the table called every unaccepted invite
 * "pending". Reported from production 2026-10-04: an operator's invite to a
 * store had lapsed a week earlier, still read "pending", and signing up with
 * that number "did nothing". Resending replaces it with a fresh one.
 */
export type InviteState = "pending" | "expired"

export const inviteState = (
  expiresAt: Date | string,
  now: number = Date.now()
): InviteState => (new Date(expiresAt).getTime() <= now ? "expired" : "pending")

/**
 * Whom an invite was sent to. Every invite form sends a phone and no email, so
 * a toast built on the email alone said "resent to -".
 */
export const inviteContact = (invite: {
  phone?: string | null
  email?: string | null
}): string => invite.phone || invite.email || "-"
