import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import type { AxisOption, AxisVariant } from "./variant-axes"

type RawQuery = {
  raw: <T>(sql: string, bindings: unknown[]) => Promise<{ rows: T[] }>
}

export type ProductAxisState = {
  options: AxisOption[]
  variants: AxisVariant[]
}

/**
 * The options attached to a product, the values it may use on each (the
 * `product_product_option_value` subset, which the module exposes no reader
 * for), and the value every live variant holds per option title.
 */
export const loadProductAxisState = async (
  container: MedusaContainer,
  productId: string,
): Promise<ProductAxisState> => {
  const knex = container.resolve<RawQuery>(
    ContainerRegistrationKeys.PG_CONNECTION,
  )

  const optionRows = (
    await knex.raw<{
      option_id: string
      title: string
      is_exclusive: boolean | null
      value_id: string | null
      value: string | null
      allowed: boolean
    }>(
      `select o.id as option_id, o.title, o.is_exclusive,
              ov.id as value_id, ov.value,
              exists (
                select 1 from product_product_option_value ppov
                 where ppov.product_product_option_id = ppo.id
                   and ppov.product_option_value_id = ov.id
                   and ppov.deleted_at is null
              ) as allowed
         from product_product_option ppo
         join product_option o on o.id = ppo.product_option_id and o.deleted_at is null
         left join product_option_value ov on ov.option_id = o.id and ov.deleted_at is null
        where ppo.product_id = ? and ppo.deleted_at is null
        order by ppo.created_at, ov.created_at`,
      [productId],
    )
  ).rows

  const options = new Map<string, AxisOption>()
  for (const row of optionRows) {
    const option = options.get(row.option_id) ?? {
      id: row.option_id,
      title: row.title,
      is_exclusive: row.is_exclusive,
      values: [],
      allowed_value_ids: [],
    }
    if (row.value_id && row.value !== null) {
      option.values.push({ id: row.value_id, value: row.value })
      if (row.allowed) {
        option.allowed_value_ids!.push(row.value_id)
      }
    }
    options.set(row.option_id, option)
  }

  const variantRows = (
    await knex.raw<{
      variant_id: string
      title: string | null
      value: string | null
    }>(
      `select v.id as variant_id, o.title, ov.value
         from product_variant v
         left join product_variant_option pvo on pvo.variant_id = v.id
         left join product_option_value ov on ov.id = pvo.option_value_id and ov.deleted_at is null
         left join product_option o on o.id = ov.option_id and o.deleted_at is null
        where v.product_id = ? and v.deleted_at is null
        order by v.variant_rank nulls last, v.created_at`,
      [productId],
    )
  ).rows

  const variants = new Map<string, AxisVariant>()
  for (const row of variantRows) {
    const variant = variants.get(row.variant_id) ?? {
      id: row.variant_id,
      options: {},
    }
    if (row.title && row.value !== null) {
      variant.options[row.title] = row.value
    }
    variants.set(row.variant_id, variant)
  }

  return { options: [...options.values()], variants: [...variants.values()] }
}
