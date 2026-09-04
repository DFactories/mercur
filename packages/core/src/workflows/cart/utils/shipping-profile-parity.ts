/**
 * Predicting Medusa's orphan-profile cull, so a marketplace cart never loses
 * carriage a buyer already chose.
 *
 * `refreshCartShippingMethodsWorkflow` — which `refreshCartItemsWorkflow` runs
 * unconditionally, so EVERY cart mutation reaches it — drops a cart shipping
 * method when the shipping option's `shipping_profile_id` is not among the
 * profiles the cart's items require:
 *
 *     const shouldCleanupOrphanProfiles = shippingMethods.length > 1
 *     const requiredProfileIds = new Set(items
 *       .filter((item) => item.requires_shipping)
 *       .map((item) => item.variant?.product?.shipping_profile?.id)
 *       .filter(Boolean))
 *     …
 *     if (shouldCleanupOrphanProfiles && profileId && !requiredProfileIds.has(profileId))
 *       return false   // ⇒ the method is deleted
 *
 * In single-vendor Medusa that is right: a profile with no items left has no
 * freight to carry. In a marketplace it is a trap, because the gate is
 * `shippingMethods.length > 1` — which in Mercur means EXACTLY "more than one
 * seller is shipping", since options are listed per seller. So the first
 * producer's carriage survives and the second one's arrival deletes both.
 *
 * Measured on the running backend (cart `cart_01M1H8GK26WK2RREATG2PJTVYK`):
 * «باربری» was created at 18:30:05 and survived alone; «ترابرنت» was created at
 * 18:30:07.931; at 18:30:08.075 BOTH rows were soft-deleted in the same
 * refresh, 144ms later. Every seller shipping option sat on «مرسولات
 * سنگین/حجیم» while the cart's products sat on «سنگین» — so no option was ever
 * "required", and the buyer was left with no carriage and nothing said.
 *
 * This module mirrors Medusa's predicate EXACTLY — the product's profile, not
 * the offer's, and the same `> 1` gate — because its only job is to answer
 * "would Medusa delete this?" before the buyer is told the method was added.
 * Reading the offer's profile instead would be more Mercur-ish and would let
 * through the very rows the cull then removes.
 */

/** Just enough of a cart item to answer the question. */
export type CartItemForShippingParity = {
  requires_shipping?: boolean | null
  variant?: {
    product?: {
      shipping_profile?: { id?: string | null } | null
    } | null
  } | null
}

/** Just enough of a shipping option to answer the question. */
export type ShippingOptionForParity = {
  id?: string | null
  name?: string | null
  shipping_profile_id?: string | null
}

/**
 * The shipping profiles this cart's items still require.
 *
 * Only items that require shipping count — a digital line keeps no carriage
 * alive, and Medusa's own filter says so first.
 */
export const cartRequiredShippingProfileIds = (
  items: CartItemForShippingParity[] | null | undefined
): Set<string> => {
  const ids = new Set<string>()

  for (const item of items ?? []) {
    if (!item?.requires_shipping) {
      continue
    }

    const id = item?.variant?.product?.shipping_profile?.id
    if (id) {
      ids.add(id)
    }
  }

  return ids
}

/**
 * The rule itself, in one place: an option's profile must be a profile the
 * goods it carries actually sit on.
 *
 * `goodsProfileIds` is whichever goods the caller is asking about — the cart's
 * items on the buyer side, the seller's own offered products in the vendor
 * panel. Both ask the same question of the same rule; only the goods differ.
 *
 * A profile-less option is never a mismatch: Medusa's `profileId &&` guard
 * skips it too, so calling it one would invent a failure Medusa never has.
 */
export const isShippingProfileWithoutGoods = (
  profileId: string | null | undefined,
  goodsProfileIds: Set<string>
): boolean => !!profileId && !goodsProfileIds.has(profileId)

export type UnkeepableShippingOption = {
  id: string
  name: string
  shipping_profile_id: string
}

/**
 * Which of `options` this cart would lose again the moment Medusa refreshes it.
 *
 * `resultingMethodCount` is what the cart will hold AFTER the add — the count
 * Medusa's own `shippingMethods.length > 1` gate will see. Below that gate
 * nothing is culled, so nothing is refused: a single-seller cart whose option
 * sits on a mismatched profile works today and must keep working. Refusing it
 * would turn a live checkout into an error for no gain.
 */
export const findUnkeepableShippingOptions = (args: {
  items: CartItemForShippingParity[] | null | undefined
  options: ShippingOptionForParity[] | null | undefined
  resultingMethodCount: number
}): UnkeepableShippingOption[] => {
  if (args.resultingMethodCount <= 1) {
    return []
  }

  const required = cartRequiredShippingProfileIds(args.items)
  const unkeepable: UnkeepableShippingOption[] = []

  for (const option of args.options ?? []) {
    const profileId = option?.shipping_profile_id
    if (!isShippingProfileWithoutGoods(profileId, required)) {
      continue
    }

    unkeepable.push({
      id: option?.id ?? "",
      name: option?.name ?? "",
      shipping_profile_id: profileId as string,
    })
  }

  return unkeepable
}

/**
 * The sentence an operator can act on.
 *
 * It names the option AND both sides of the mismatch, because the fix is
 * always one of two edits — move the option onto a profile the goods use, or
 * move the goods onto the option's profile — and neither is guessable from
 * "shipping method could not be added".
 */
export const describeUnkeepableShippingOptions = (
  unkeepable: UnkeepableShippingOption[],
  requiredProfileIds: Set<string>
): string => {
  const listed = unkeepable
    .map((o) => `${o.name || o.id} (shipping profile ${o.shipping_profile_id})`)
    .join(", ")

  const required = Array.from(requiredProfileIds).join(", ") || "none"

  return (
    `Shipping option ${listed} is on a shipping profile none of this cart's ` +
    `items require (the cart requires: ${required}). Medusa removes such a ` +
    `method on the next cart refresh once the cart holds more than one, so it ` +
    `is refused here instead of disappearing after it was accepted. Put the ` +
    `seller's shipping option on a profile its goods use, or the goods on the ` +
    `option's profile.`
  )
}
