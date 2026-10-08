import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

export type OfferedRemovalsInput = {
  variants: Array<{ variant_id: string; requested_by?: string | null }>
  products: Array<{ product_id: string; requested_by?: string | null }>
}

type LiveOffer = {
  id: string
  seller_id: string
  variant_id: string
  product_id: string
  seller?: { name?: string | null } | null
}

export const variantOnSaleMessage = (title: string, stores: string[]) =>
  `Variant "${title}" is on sale by ${stores.join(", ")}`

export const productOnSaleMessage = (stores: string[]) =>
  `Product is on sale by ${stores.join(", ")}`

const storeNames = (offers: LiveOffer[]) =>
  Array.from(
    new Set(offers.map((offer) => offer.seller?.name || offer.seller_id)),
  )

/**
 * A master product's variant carries every store's offer on it, and its price
 * set holds their prices. Deleting the variant soft-deletes that price set but
 * not the offers, so other stores were left selling nothing at no price
 * (production, 2026-10-08: one store's approved edit emptied another's two
 * products). The requester may drop its own offers with the variant; anyone
 * else's offer blocks the removal. Operators are not sellers, so every offer is
 * someone else's to them — except when they delete a whole product, which
 * closes its offers by design.
 */
export const resolveOfferedRemovals = async (
  container: MedusaContainer,
  input: OfferedRemovalsInput,
): Promise<string[]> => {
  const variants = input.variants ?? []
  const products = input.products ?? []

  if (!variants.length && !products.length) {
    return []
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const fields = ["id", "seller_id", "variant_id", "product_id", "seller.name"]

  const variantOffers: LiveOffer[] = variants.length
    ? ((
        await query.graph({
          entity: "offer",
          fields,
          filters: { variant_id: variants.map((v) => v.variant_id) },
        })
      ).data as LiveOffer[])
    : []

  const productOffers: LiveOffer[] = products.length
    ? ((
        await query.graph({
          entity: "offer",
          fields,
          filters: { product_id: products.map((p) => p.product_id) },
        })
      ).data as LiveOffer[])
    : []

  const requesters = Array.from(
    new Set(
      [...variants, ...products]
        .map((r) => r.requested_by)
        .filter((id): id is string => !!id),
    ),
  )
  const { data: requestingSellers } = requesters.length
    ? await query.graph({
        entity: "seller",
        fields: ["id"],
        filters: { id: requesters },
      })
    : { data: [] as Array<{ id: string }> }
  const sellerIds = new Set(
    (requestingSellers as Array<{ id: string }>).map((s) => s.id),
  )

  const toClose = new Set<string>()

  for (const { variant_id, requested_by } of variants) {
    const onVariant = variantOffers.filter((o) => o.variant_id === variant_id)
    const foreign = onVariant.filter((o) => o.seller_id !== requested_by)

    if (foreign.length) {
      const { data: found } = await query.graph({
        entity: "variant",
        fields: ["id", "title"],
        filters: { id: variant_id },
      })
      const title =
        (found?.[0] as { title?: string | null } | undefined)?.title ??
        variant_id
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        variantOnSaleMessage(title, storeNames(foreign)),
      )
    }

    onVariant.forEach((o) => toClose.add(o.id))
  }

  for (const { product_id, requested_by } of products) {
    const onProduct = productOffers.filter((o) => o.product_id === product_id)
    const bySeller = !!requested_by && sellerIds.has(requested_by)
    const foreign = bySeller
      ? onProduct.filter((o) => o.seller_id !== requested_by)
      : []

    if (foreign.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        productOnSaleMessage(storeNames(foreign)),
      )
    }

    onProduct.forEach((o) => toClose.add(o.id))
  }

  return Array.from(toClose)
}

export const checkOfferedRemovalsStepId = "pc-check-offered-removals"

export const checkOfferedRemovalsStep = createStep(
  checkOfferedRemovalsStepId,
  async (input: OfferedRemovalsInput, { container }) =>
    new StepResponse({
      offer_ids: await resolveOfferedRemovals(container, input),
    }),
)
