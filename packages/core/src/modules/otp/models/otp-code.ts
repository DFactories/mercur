import { model } from "@medusajs/framework/utils"

/**
 * A one-time passcode issued for phone authentication.
 *
 * Stored hashed (HMAC), short-lived, and attempt-limited. This table is owned
 * entirely by the auth/OTP path and is never touched by the notification
 * pipeline or its per-event settings.
 */
const OtpCode = model
  .define("otp_code", {
    id: model.id({ prefix: "otp" }).primaryKey(),
    /** Recipient identity — the phone number in E.164 form. */
    identifier: model.text(),
    /** Which actor the code authenticates: "customer" | "member". */
    actor_type: model.text(),
    /** HMAC of the plaintext code — the raw code is never persisted. */
    code_hash: model.text(),
    expires_at: model.dateTime(),
    consumed_at: model.dateTime().nullable(),
    attempts: model.number().default(0),
  })
  .indexes([
    {
      on: ["identifier", "actor_type"],
      name: "IDX_otp_code_identifier_actor_type",
    },
  ])

export default OtpCode
