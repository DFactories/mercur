import { Badge } from "@medusajs/ui"
import { createColumnHelper } from "@tanstack/react-table"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import {
  CategoryCell,
  CategoryHeader,
} from "../../../components/table/table-cells/product/category-cell/category-cell"
import {
  CollectionCell,
  CollectionHeader,
} from "../../../components/table/table-cells/product/collection-cell/collection-cell"
import {
  ProductCell,
  ProductHeader,
} from "../../../components/table/table-cells/product/product-cell"
import {
  ProductStatusCell,
  ProductStatusHeader,
} from "../../../components/table/table-cells/product/product-status-cell"
import {
  VariantCell,
  VariantHeader,
} from "../../../components/table/table-cells/product/variant-cell"
import { ProductDTO } from "@mercurjs/types"

const columnHelper = createColumnHelper<ProductDTO>()

export const useProductTableColumns = () => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.display({
        id: "product",
        header: () => <ProductHeader />,
        cell: ({ row }) => (
          <ProductCell
            product={row.original}
            data-testid={`products-table-cell-${row.id}-product-value`}
          />
        ),
      }),
      columnHelper.accessor("categories", {
        header: () => <CategoryHeader />,
        cell: ({ row }) => (
          <CategoryCell
            categories={row.original.categories}
            data-testid={`products-table-cell-${row.id}-categories-value`}
          />
        ),
      }),
      columnHelper.accessor("collection", {
        header: () => <CollectionHeader />,
        cell: ({ row }) => (
          <CollectionCell
            collection={row.original.collection}
            data-testid={`products-table-cell-${row.id}-collection-value`}
          />
        ),
      }),
      columnHelper.accessor("variants", {
        header: () => <VariantHeader />,
        cell: ({ row }) => (
          <VariantCell
            variants={row.original.variants}
            data-testid={`products-table-cell-${row.id}-variants-value`}
          />
        ),
      }),
      columnHelper.accessor("status", {
        header: () => <ProductStatusHeader />,
        cell: ({ row }) => (
          <div className="flex items-center gap-x-2">
            <ProductStatusCell
              status={row.original.status}
              data-testid={`products-table-cell-${row.id}-status-value`}
            />
            {(row.original as ProductDTO & {
              pending_change?: { id: string } | null
            }).pending_change ? (
              <Badge size="2xsmall" color="orange">
                {t("products.edits.pendingBadge")}
              </Badge>
            ) : null}
          </div>
        ),
      }),
    ],
    [t]
  )
}
