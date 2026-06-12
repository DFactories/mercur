import { createRequestOtpHandler } from "../../../../utils/phone-otp"

// Public: a customer requests an OTP for their phone number.
export const AUTHENTICATE = false

export const POST = createRequestOtpHandler("customer")
