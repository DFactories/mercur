// Route: /products/:id/stock
import { AnimatePresence } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { ColumnDef } from "@tanstack/react-table"
import { ProgressBar } from "@components/common/progress-bar"
import { Skeleton } from "@components/common/skeleton"
import { DataGridSkeleton } from "@components/data-grid/components"
import { RouteFocusModal } from "@components/modals"
import { ProductStockForm } from "./product-stock-form"
import { useProduct, useStockLocations } from "@hooks/api"

export const Component = () => {
  const { t } = useTranslation()

  const { id } = useParams()

  const { product, isLoading: isProductLoading } = useProduct(id!, {
    fields:
      "id,thumbnail,variants.id,variants.title,variants.sku,variants.inventory_items.variant_id,variants.inventory_items.inventory_item_id,variants.inventory_items.required_quantity,variants.inventory_items.inventory.id,variants.inventory_items.inventory.title,variants.inventory_items.inventory.sku,*variants.inventory_items.inventory.location_levels",
  })
  const { stock_locations, isLoading: isStockLoading } = useStockLocations()

  const allVariants = product?.variants?.map((variant) => ({
    ...variant,
    inventory_items: variant.inventory_items?.map((item) => ({
      ...item,
      inventory: item.inventory,
    })),
  }))

  const [isLoading, setIsLoading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setIsLoading(true)
    }, 200)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const onLoaded = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setIsLoading(false)
  }

  return (
    <div>
      <div className="fixed inset-x-0 top-0 z-50 h-1">
        <AnimatePresence>
          {isLoading || isProductLoading || isStockLoading ? (
            <ProgressBar duration={5} />
          ) : null}
        </AnimatePresence>
      </div>
      <RouteFocusModal>
        <RouteFocusModal.Title asChild>
          <span className="sr-only">{t("products.stock.heading")}</span>
        </RouteFocusModal.Title>
        <RouteFocusModal.Description asChild>
          <span className="sr-only">{t("products.stock.description")}</span>
        </RouteFocusModal.Description>
        {isProductLoading || isStockLoading || !product || !stock_locations ? (
          <ProductStockFallback />
        ) : (
          <ProductStockForm
            variants={allVariants || []}
            locations={stock_locations || []}
            onLoaded={onLoaded}
          />
        )}
      </RouteFocusModal>
    </div>
  )
}

const ProductStockFallback = () => {
  return (
    <div className="relative flex size-full flex-col items-center justify-center divide-y">
      <div className="flex size-full flex-col divide-y">
        <div className="px-4 py-2">
          <Skeleton className="h-7 w-7" />
        </div>
        <div className="flex-1 overflow-auto">
          <DataGridSkeleton
            columns={Array.from({ length: 10 }) as ColumnDef<any>[]}
          />
        </div>
        <div className="bg-ui-bg-base flex items-center justify-end gap-x-2 p-4">
          <Skeleton className="h-7 w-[59px]" />
          <Skeleton className="h-7 w-[46px]" />
        </div>
      </div>
    </div>
  )
}
