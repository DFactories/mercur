import { createSellerPhoneRequestOtpHandler } from "../../../../../utils/phone-otp"

// Authenticated + seller-scoped: the store owner starts verification of the
// selected store's phone (auto-verifies when it's their own login phone).
export const POST = createSellerPhoneRequestOtpHandler()
