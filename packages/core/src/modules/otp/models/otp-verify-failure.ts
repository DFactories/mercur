import { model } from "@medusajs/framework/utils"

/**
 * One wrong guess at a login code, kept by the address that made it.
 *
 * `otp_code.attempts` counts guesses per number. This counts them per address,
 * so one client cannot spread its guesses over many numbers.
 */
const OtpVerifyFailure = model
  .define("otp_verify_failure", {
    id: model.id({ prefix: "otpf" }).primaryKey(),
    ip: model.text(),
  })
  .indexes([
    {
      on: ["ip", "created_at"],
      name: "IDX_otp_verify_failure_ip_created_at",
    },
  ])

export default OtpVerifyFailure
