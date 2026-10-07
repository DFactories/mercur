import { ClockSolidMini } from "@medusajs/icons";
import { Badge, Tooltip } from "@medusajs/ui";
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
        // A pending edit sits UNDER the status, not beside it: the status
        // column is narrow, and the Persian label wrapped inside the badge
        // and spilled over the row. One line each, the full sentence in the
        // tooltip.
        cell: ({ row }) => {
          const pending = (row.original as { pending_change?: { id: string } | null })
            .pending_change;
          if (!pending) {
            return <ProductStatusCell status={row.original.status} />;
          }
          return (
            <div className="flex h-full w-full flex-col justify-center gap-y-0.5 overflow-hidden py-1">
              <div className="h-5">
                <ProductStatusCell status={row.original.status} />
              </div>
              <Tooltip content={t("products.edits.pendingTooltip")}>
                <Badge
                  size="2xsmall"
                  color="orange"
                  className="w-fit max-w-full gap-x-1 whitespace-nowrap"
                >
                  <ClockSolidMini className="shrink-0" />
                  <span className="truncate">
                    {t("products.edits.pendingShort")}
                  </span>
                </Badge>
              </Tooltip>
            </div>
          );
        },
      }),
    ],
    [t],
  );
};
