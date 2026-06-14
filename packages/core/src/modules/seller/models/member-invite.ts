import { model } from "@medusajs/framework/utils"
import Seller from "./seller"

const MemberInvite = model
  .define("MemberInvite", {
    id: model.id({ prefix: "meminv" }).primaryKey(),
    // Phone is the primary invite identity (OTP-native invites); email is kept
    // optional for backward compatibility. Exactly one is set per invite.
    email: model.text().searchable().nullable(),
    phone: model.text().searchable().nullable(),
    token: model.text(),
    accepted: model.boolean().default(false),
    expires_at: model.dateTime(),
    role_id: model.text(),
    seller: model.belongsTo(() => Seller, {
      mappedBy: "member_invites",
    }),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      on: ["email", "seller_id"],
      unique: true,
      where: "deleted_at IS NULL AND accepted = false AND email IS NOT NULL",
    },
    {
      on: ["phone", "seller_id"],
      unique: true,
      where: "deleted_at IS NULL AND accepted = false AND phone IS NOT NULL",
    },
    {
      on: ["token"],
      where: "deleted_at IS NULL",
    },
  ])

export default MemberInvite
