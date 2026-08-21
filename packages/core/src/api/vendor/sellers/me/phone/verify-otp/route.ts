import { createSellerPhoneVerifyOtpHandler } from "../../../../../utils/phone-otp"

// Authenticated + seller-scoped: confirm the selected store's phone with the code.
export const POST = createSellerPhoneVerifyOtpHandler()
