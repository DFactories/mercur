import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { HttpTypes } from "@mercurjs/types"

import { createSellerShippingProfilesWorkflow } from "../../../workflows/shipping-profile"
import { refetchShippingProfile } from "./helpers"
import { VendorCreateShippingProfileType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<HttpTypes.VendorShippingProfileListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId = req.seller_context!.seller_id

  // A vendor sees TWO kinds of shipping profiles:
  //   1. its own (linked via `shipping_profile_seller`), and
  //   2. the global, admin-curated profiles (no seller link) — shared across the
  //      whole marketplace, exactly like global shipping option types. Global
  //      profiles are selectable but NOT editable/deletable by a vendor (the
  //      [id] write routes still enforce seller ownership).
  // So a fresh seller always has at least the admin profiles to pick from, with
  // no per-seller linking step needed.
  const { data: links } = await query.graph({
    entity: "shipping_profile_seller",
    fields: ["shipping_profile_id", "seller_id"],
    // Profiles are low-cardinality; this comfortably covers the link table.
    pagination: { skip: 0, take: 10000 },
  })
  const linkedIds = new Set(links.map((l) => l.shipping_profile_id))
  const myIds = new Set(
    links
      .filter((l) => l.seller_id === sellerId)
      .map((l) => l.shipping_profile_id)
  )

  // Fetch the candidate profiles (other query filters like `q`/`type` still
  // apply) and keep only the ones THIS vendor may see: its own, plus any global
  // (admin-curated) profile that no seller owns. Profiles are few, so the
  // own/global split + pagination is done in memory.
  const { data: profiles } = await query.graph({
    entity: "shipping_profile",
    fields: req.queryConfig.fields,
    filters: req.filterableFields,
    pagination: { skip: 0, take: 10000 },
  })

  const visible = profiles.filter(
    (p) => myIds.has(p.id) || !linkedIds.has(p.id)
  )

  const skip = req.queryConfig.pagination?.skip ?? 0
  const take = req.queryConfig.pagination?.take ?? visible.length
  const shipping_profiles = visible.slice(skip, skip + take)

  res.json({
    shipping_profiles,
    count: visible.length,
    offset: skip,
    limit: take,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateShippingProfileType>,
  res: MedusaResponse<HttpTypes.VendorShippingProfileResponse>
) => {
  const sellerId = req.seller_context!.seller_id

  const { result } = await createSellerShippingProfilesWorkflow(req.scope).run({
    input: {
      seller_id: sellerId,
      shipping_profiles: [req.validatedBody],
    },
  })

  const shippingProfile = await refetchShippingProfile(
    req.scope,
    result[0].id,
    req.queryConfig.fields
  )

  res.status(201).json({ shipping_profile: shippingProfile })
}
