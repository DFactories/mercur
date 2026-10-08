import { Children, ReactNode } from "react"
import { useLoaderData, useParams } from "react-router-dom"

import { useLinkQuery, WidgetZone } from "@mercurjs/dashboard-shared"

import { TwoColumnPageSkeleton } from "../../../components/common/skeleton"
import { TwoColumnPage } from "../../../components/layout/pages"
import { useOffers } from "../../../hooks/api/offers"
import { useProduct } from "../../../hooks/api/products"
import { ProductMediaSection } from "../../products/[id]/_components/product-media-section"
import { OFFER_PRODUCT_DETAIL_FIELDS } from "../common/constants"
import { OfferProduct } from "../common/types"
import { OfferDetailGeneralSection } from "./_components/offer-detail-general-section"
import { OfferVariantsSection } from "./_components/offer-variants-section"
import { OfferAssociatedProductSection } from "./_components/offer-associated-product-section"
import { loader } from "./loader"

const Root = ({ children }: { children?: ReactNode }) => {
  const { id } = useParams()
  const initialData = useLoaderData() as Awaited<ReturnType<typeof loader>>
  const query = useLinkQuery("offer", OFFER_PRODUCT_DETAIL_FIELDS)

  const { product, isLoading, isError, error } = useProduct(id!, query, {
    initialData,
  })

  // An offer whose variant was removed from the product is no longer wrapped
  // under any variant, so the table above would never show it — yet it still
  // holds its SKU and stays on the store. Listed so its seller can delete it.
  const { offers: productOffers } = useOffers(
    { product_id: id!, fields: "id,sku,variant_id,created_at,updated_at" },
    { enabled: !!product },
  )

  if (isError) {
    throw error
  }

  if (isLoading || !product) {
    return <TwoColumnPageSkeleton mainSections={3} sidebarSections={1} />
  }

  const typed = product as OfferProduct
  const liveVariantIds = new Set((typed.variants ?? []).map((v) => v.id))
  const removedVariantOffers = (productOffers ?? []).filter(
    (offer) => !liveVariantIds.has(offer.variant_id),
  )

  return (
    <>
      {Children.count(children) > 0 ? (
        children
      ) : (
        <TwoColumnPage data={typed} hasOutlet>
          <TwoColumnPage.Main>
            <WidgetZone id="offers.detail.main" data={typed}>
              <OfferDetailGeneralSection product={typed} />
              <ProductMediaSection product={typed} readOnly />
              <OfferVariantsSection
                variants={typed.variants}
                removedVariantOffers={removedVariantOffers}
                thumbnail={typed.thumbnail}
              />
            </WidgetZone>
          </TwoColumnPage.Main>
          <TwoColumnPage.Sidebar>
            <WidgetZone id="offers.detail.side" data={typed}>
              <OfferAssociatedProductSection product={typed} />
            </WidgetZone>
          </TwoColumnPage.Sidebar>
        </TwoColumnPage>
      )}
    </>
  )
}

export const OfferDetailPage = Object.assign(Root, {
  Main: TwoColumnPage.Main,
  Sidebar: TwoColumnPage.Sidebar,
  General: OfferDetailGeneralSection,
  Media: ProductMediaSection,
  Variants: OfferVariantsSection,
  AssociatedProduct: OfferAssociatedProductSection,
})

export const Component = Root
