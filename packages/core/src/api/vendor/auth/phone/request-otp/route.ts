import { createRequestOtpHandler } from "../../../../utils/phone-otp"

// Public: a member requests an OTP for their phone number.
export const AUTHENTICATE = false

export const POST = createRequestOtpHandler("member")
