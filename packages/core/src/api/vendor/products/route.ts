import {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { AdditionalData } from "@medusajs/framework/types"
import { HttpTypes } from "@mercurjs/types"

import {
  createProductsWorkflow,
  type CreateProductsWorkflowInput,
} from "../../../workflows/product/workflows/create-products"
import {
  annotatePendingChanges,
  enrichProductAttributes,
  withoutLinkedAttributeValues,
  wrapProductVariantsWithOffers,
} from "../../utils"
import { VendorCreateProductType, VendorGetProductsParamsType } from "./validators"

export const GET = async (
  req: AuthenticatedMedusaRequest<VendorGetProductsParamsType>,
  res: MedusaResponse<HttpTypes.VendorProductListResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const withOffers = req.queryConfig.fields.some((field) =>
    field.includes("variants.offers")
  )
  if (withOffers) {
    req.queryConfig.fields = req.queryConfig.fields.filter(
      (field) => !field.includes("variants.offers")
    )
  }

  const { data: products, metadata } = await query.graph({
    entity: "product",
    fields: withoutLinkedAttributeValues(req.queryConfig.fields),
    filters: req.filterableFields,
    pagination: req.queryConfig.pagination,
  })

  await enrichProductAttributes(req.scope, products as any[])
  await annotatePendingChanges(
    req.scope,
    products as { id: string }[],
    req.seller_context!.seller_id
  )

  if (withOffers) {
    await wrapProductVariantsWithOffers(
      req.scope,
      products as Parameters<typeof wrapProductVariantsWithOffers>[1],
      req.seller_context!.seller_id
    )
  }

  res.json({
    products,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<VendorCreateProductType & AdditionalData>,
  res: MedusaResponse<HttpTypes.VendorProductResponse>
) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const sellerId = req.seller_context!.seller_id

  const { additional_data, ...payload } = req.validatedBody

  // A created product is a shared master product. No `product_seller` row is
  // written: that link is the operator's selling allowlist, and a row naming
  // the creator would hide the product from every other seller. The creator
  // is recorded by `created_by` in the change history, which is what keeps an
  // unpublished submission visible to it alone.
  const productInput = {
    ...payload,
    status: payload.status ?? ProductStatus.PROPOSED,
  } as unknown as CreateProductsWorkflowInput["products"][number]

  const { result } = await createProductsWorkflow(req.scope).run({
    input: {
      products: [productInput],
      created_by: sellerId,
      additional_data,
    },
  })

  const createdId = (result as { id: string }[])[0].id

  const {
    data: [product],
  } = await query.graph({
    entity: "product",
    fields: withoutLinkedAttributeValues(req.queryConfig.fields),
    filters: { id: createdId },
  })

  await enrichProductAttributes(req.scope, [product])

  res.status(201).json({ product })
}
