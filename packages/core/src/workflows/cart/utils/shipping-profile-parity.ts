/**
 * A shipping option must sit on a profile the goods it carries ship from — and
 * in a marketplace the OFFER, not the master product, says which profile that
 * is.
 *
 * Completion checks exactly this (`validateSellerCartShippingStep`, upstream
 * #1417): every cart item that requires shipping needs its
 * `offer.shipping_profile_id` among the profiles of the cart's shipping
 * methods, with no fallback to the product. A carriage on a profile none of the
 * cart's offers use therefore cannot complete — and on this marketplace
 * completion runs in the payment gateway's callback, after the buyer has paid.
 * This module answers the same question when the carriage is chosen, so the
 * buyer is told before paying.
 *
 * History, because both halves of the old rule are gone:
 *
 * - It used to read the PRODUCT's profile and only refuse once the cart held
 *   more than one method, because its job was predicting Medusa's
 *   orphan-profile cull in `refreshCartShippingMethodsWorkflow` (production
 *   cart `cart_01M1H8GK26WK2RREATG2PJTVYK`, 2026-09-02: a second producer's
 *   carriage deleted both). Mercur now disables that cull at boot (upstream
 *   #1455, `src/patches`), so there is nothing left to predict.
 * - Kept as it was, it refused the right carriage: the product↔profile link is
 *   one-to-one and the FIRST offerer wins it, so on a shared master product a
 *   second producer's correct carriage "carried nothing" by the product's
 *   profile.
 */

/** Just enough of a cart item to answer the question. */
export type CartItemForShippingParity = {
  requires_shipping?: boolean | null
  offer?: { shipping_profile_id?: string | null } | null
}

/** Just enough of a shipping option to answer the question. */
export type ShippingOptionForParity = {
  id?: string | null
  name?: string | null
  shipping_profile_id?: string | null
}

/**
 * The shipping profiles this cart's goods ship from: each shipping line's
 * offer profile.
 *
 * Only items that require shipping count — completion filters on that first,
 * so a digital line asks for no carriage.
 */
export const cartRequiredShippingProfileIds = (
  items: CartItemForShippingParity[] | null | undefined
): Set<string> => {
  const ids = new Set<string>()

  for (const item of items ?? []) {
    if (!item?.requires_shipping) {
      continue
    }

    const id = item?.offer?.shipping_profile_id
    if (id) {
      ids.add(id)
    }
  }

  return ids
}

/**
 * The rule itself, in one place: an option's profile must be a profile the
 * goods it carries ship from.
 *
 * `goodsProfileIds` is whichever goods the caller is asking about — the cart's
 * offers on the buyer side, the seller's own offers in the vendor panel. Both
 * ask the same question of the same rule; only the goods differ.
 *
 * A profile-less option is never a mismatch here: it is not this rule's to
 * judge, and inventing a failure for it would refuse what nothing else does.
 */
export const isShippingProfileWithoutGoods = (
  profileId: string | null | undefined,
  goodsProfileIds: Set<string>
): boolean => !!profileId && !goodsProfileIds.has(profileId)

export type ShippingOptionWithoutGoods = {
  id: string
  name: string
  shipping_profile_id: string
}

/**
 * Which of `options` sit on a profile none of this cart's goods ship from.
 *
 * A cart with no shipping line refuses nothing: completion asks no profile of
 * it, so any carriage is harmless there.
 */
export const findShippingOptionsWithoutGoods = (args: {
  items: CartItemForShippingParity[] | null | undefined
  options: ShippingOptionForParity[] | null | undefined
}): ShippingOptionWithoutGoods[] => {
  const required = cartRequiredShippingProfileIds(args.items)
  if (!required.size) {
    return []
  }

  const found: ShippingOptionWithoutGoods[] = []

  for (const option of args.options ?? []) {
    const profileId = option?.shipping_profile_id
    if (!isShippingProfileWithoutGoods(profileId, required)) {
      continue
    }

    found.push({
      id: option?.id ?? "",
      name: option?.name ?? "",
      shipping_profile_id: profileId as string,
    })
  }

  return found
}

/**
 * The sentence an operator can act on.
 *
 * It names the option AND both sides of the mismatch, because the fix is
 * always one of two edits — move the option onto the profile the seller's
 * offers use, or move the offers onto the option's profile — and neither is
 * guessable from "shipping method could not be added".
 */
export const describeShippingOptionsWithoutGoods = (
  options: ShippingOptionWithoutGoods[],
  requiredProfileIds: Set<string>
): string => {
  const listed = options
    .map((o) => `${o.name || o.id} (shipping profile ${o.shipping_profile_id})`)
    .join(", ")

  const required = Array.from(requiredProfileIds).join(", ") || "none"

  return (
    `Shipping option ${listed} is on a shipping profile none of this cart's ` +
    `offers ship from (the cart's offers use: ${required}). The order could ` +
    `not be completed with it, so it is refused here instead of at checkout. ` +
    `Put the seller's shipping option on the profile its offers use, or the ` +
    `offers on the option's profile.`
  )
}
