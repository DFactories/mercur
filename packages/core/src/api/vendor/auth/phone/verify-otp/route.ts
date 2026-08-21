import { createVerifyOtpHandler } from "../../../../utils/phone-otp"

// Public: verify the OTP and mint a member session token.
export const AUTHENTICATE = false

export const POST = createVerifyOtpHandler("member")
