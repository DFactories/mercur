import {
  WorkflowData,
  WorkflowResponse,
  createWorkflow,
  transform,
} from "@medusajs/framework/workflows-sdk"
import { useQueryGraphStep } from "@medusajs/medusa/core-flows"
import { CommissionLineDTO } from "@mercurjs/types"

import {
  getCommissionLinesStep,
  resolvePromotionCostSharesStep,
  upsertCommissionLinesStep,
} from "../steps"

const orderFields = [
  "id",
  "status",
  "version",
  "currency_code",
  "email",
  "canceled_at",
  "sales_channel_id",
  "region_id",
  "customer_id",
  "customer.*",
  "customer.groups.*",
  "promotions.*",
  "subtotal",
  "items.*",
  "items.subtotal",
  "items.tax_total",
  "items.product.id",
  "items.product.collection_id",
  "items.product.categories.id",
  "items.product.tags.id",
  "items.product.type_id",
  "items.offer.seller_id",
  "items.adjustments.*",
  "shipping_methods.*",
  "shipping_methods.total",
  "shipping_methods.subtotal",
  "shipping_methods.tax_total",
  "shipping_methods.adjustments.*",
  "shipping_methods.shipping_option_id",
  "shipping_address.*",
]

export type RefreshOrderCommissionLinesWorkflowInput = {
  order_ids: string[]
}

export const refreshOrderCommissionLinesWorkflowId = "refresh-order-commission-lines"


export const refreshOrderCommissionLinesWorkflow = createWorkflow(
  refreshOrderCommissionLinesWorkflowId,
  function (
    input: WorkflowData<RefreshOrderCommissionLinesWorkflowInput>
  ): WorkflowResponse<CommissionLineDTO[]> {
    const { data: orders } = useQueryGraphStep({
      entity: "order",
      fields: orderFields,
      filters: { id: input.order_ids },
      options: {
        throwIfKeyNotFound: true,
      },
    }).config({ name: "fetch-orders" })

    // Every promotion touching these orders, so their cost bearers resolve in
    // one pass before the contexts are built.
    const promotionIds = transform({ orders }, ({ orders }) =>
      orders.flatMap((order: any) => [
        ...(order.items ?? []).flatMap((item: any) =>
          (item.adjustments ?? []).map((adj: any) => adj.promotion_id)
        ),
        ...(order.shipping_methods ?? []).flatMap((method: any) =>
          (method.adjustments ?? []).map((adj: any) => adj.promotion_id)
        ),
      ])
    )

    const promotionShares = resolvePromotionCostSharesStep(promotionIds)

    const commissionContexts = transform(
      { orders, promotionShares },
      ({ orders, promotionShares }) => {
      // The slice of a line's discount the marketplace absorbs. An unresolved
      // promotion counts as marketplace-borne, matching the step's own default.
      const marketplaceBorne = (adjustments: any[]) =>
        (adjustments ?? []).reduce((sum: number, adj: any) => {
          const share = adj.promotion_id
            ? (promotionShares as Record<string, number>)[adj.promotion_id] ?? 1
            : 1
          return sum + Number(adj.amount ?? 0) * share
        }, 0)

      return orders.map((order: any) => ({
        currency_code: order.currency_code,
        items: (order.items ?? []).map((item: any) => ({
          id: item.id,
          subtotal: item.subtotal,
          tax_total: item.tax_total,
          marketplace_borne_discount: marketplaceBorne(item.adjustments),
          product: item.product
            ? {
              id: item.product.id,
              collection_id: item.product.collection_id,
              categories: item.product.categories,
              tags: item.product.tags,
              type_id: item.product.type_id,
              seller: item.offer?.seller_id
                ? { id: item.offer.seller_id }
                : undefined,
            }
            : undefined,
        })),
        shipping_methods: (order.shipping_methods ?? []).map((method: any) => ({
          id: method.id,
          subtotal: method.subtotal,
          tax_total: method.tax_total,
          marketplace_borne_discount: marketplaceBorne(method.adjustments),
        })),
      }))
    })

    const commissionLines = getCommissionLinesStep(commissionContexts)

    const upsertedCommissionLines = upsertCommissionLinesStep({
      commission_lines: commissionLines,
    })

    return new WorkflowResponse(upsertedCommissionLines)
  }
)
