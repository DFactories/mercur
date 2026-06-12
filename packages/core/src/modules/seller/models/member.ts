import { model } from "@medusajs/framework/utils"
import Seller from "./seller"
import SellerMember from "./seller-member"

const Member = model
  .define("Member", {
    id: model.id({ prefix: "mem" }).primaryKey(),
    // Phone is the primary identity for phone (OTP) sign-ups; email is the
    // primary identity for email/password sign-ups. Exactly one is required at
    // the application layer, so both are nullable here.
    email: model.text().searchable().nullable(),
    phone: model.text().searchable().nullable(),
    first_name: model.text().searchable().nullable(),
    last_name: model.text().searchable().nullable(),
    locale: model.text().nullable(),
    is_active: model.boolean().default(true),
    sellers: model.manyToMany(() => Seller, {
      mappedBy: "members",
      pivotEntity: () => SellerMember,
    }),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["email"],
      unique: true,
      where: "deleted_at IS NULL AND email IS NOT NULL",
    },
    {
      on: ["phone"],
      unique: true,
      where: "deleted_at IS NULL AND phone IS NOT NULL",
    },
  ])

export default Member
