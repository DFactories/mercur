import { createVerifyOtpHandler } from "../../../../utils/phone-otp"

// Public: verify the OTP and mint a customer session token.
export const AUTHENTICATE = false

export const POST = createVerifyOtpHandler("customer")
