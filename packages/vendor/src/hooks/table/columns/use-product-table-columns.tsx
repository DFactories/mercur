import { Badge } from "@medusajs/ui";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  CategoryCell,
  CategoryHeader,
} from "../../../components/table/table-cells/product/category-cell";
import {
  CollectionCell,
  CollectionHeader,
} from "../../../components/table/table-cells/product/collection-cell/collection-cell";
import {
  ProductCell,
  ProductHeader,
} from "../../../components/table/table-cells/product/product-cell";
import {
  ProductStatusCell,
  ProductStatusHeader,
} from "../../../components/table/table-cells/product/product-status-cell";
import {
  VariantCell,
  VariantHeader,
} from "../../../components/table/table-cells/product/variant-cell";
import { HttpTypes } from "@mercurjs/types";

const columnHelper = createColumnHelper<HttpTypes.VendorProduct>();

export const useProductTableColumns = () => {
  const { t } = useTranslation();

  return useMemo(
    () => [
      columnHelper.display({
        id: "product",
        header: () => <ProductHeader />,
        cell: ({ row }) => <ProductCell product={row.original} />,
      }),
      columnHelper.accessor("categories", {
        header: () => <CategoryHeader />,
        cell: ({ row }) => (
          <CategoryCell categories={row.original.categories} />
        ),
      }),
      columnHelper.accessor("collection", {
        header: () => <CollectionHeader />,
        cell: ({ row }) => (
          <CollectionCell collection={row.original.collection} />
        ),
      }),
      columnHelper.accessor("variants", {
        header: () => <VariantHeader />,
        cell: ({ row }) => <VariantCell variants={row.original.variants} />,
      }),
      columnHelper.accessor("status", {
        header: () => <ProductStatusHeader />,
        cell: ({ row }) => (
          <div className="flex items-center gap-x-2">
            <ProductStatusCell status={row.original.status} />
            {(row.original as HttpTypes.VendorProduct & {
              pending_change?: { id: string } | null;
            }).pending_change ? (
              <Badge size="2xsmall" color="orange">
                {t("products.edits.pendingBadge")}
              </Badge>
            ) : null}
          </div>
        ),
      }),
    ],
    [t],
  );
};
