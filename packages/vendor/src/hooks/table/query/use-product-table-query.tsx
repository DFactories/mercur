import { HttpTypes } from "@medusajs/types";
import { useLinkQuery } from "@mercurjs/dashboard-shared";
import { useQueryParams } from "../../use-query-params";

type UseProductTableQueryProps = {
  prefix?: string;
  pageSize?: number;
  /** Honour the «my products» filter, which is on unless `mine=false`. */
  mine?: boolean;
};

export const DEFAULT_FIELDS =
  // TODO: Remove exclusion once we avoid including unnecessary relations by default in the query config
  "id,title,handle,status,*collection,categories.id,categories.name,variants.id,thumbnail,-type,-tags,-images,-variants";

export const useProductTableQuery = ({
  prefix,
  pageSize = 20,
  mine: withMine = false,
}: UseProductTableQueryProps) => {
  const linkQuery = useLinkQuery("product", DEFAULT_FIELDS);
  const queryObject = useQueryParams(
    [
      "offset",
      "order",
      "q",
      "created_at",
      "updated_at",
      "sales_channel_id",
      "category_id",
      "collection_id",
      "is_giftcard",
      "tag_id",
      "type_id",
      "status",
      "has_pending_change",
      "mine",
      "id",
    ],
    prefix,
  );

  const {
    offset,
    sales_channel_id,
    created_at,
    updated_at,
    category_id,
    collection_id,
    tag_id,
    type_id,
    is_giftcard,
    status,
    has_pending_change,
    mine,
    order,
    q,
  } = queryObject;

  const searchParams: HttpTypes.AdminProductListParams & {
    has_pending_change?: boolean;
    mine?: boolean;
  } = {
    limit: pageSize,
    offset: offset ? Number(offset) : 0,
    sales_channel_id: sales_channel_id?.split(","),
    created_at: created_at ? JSON.parse(created_at) : undefined,
    updated_at: updated_at ? JSON.parse(updated_at) : undefined,
    category_id: category_id?.split(","),
    collection_id: collection_id?.split(","),
    is_giftcard: is_giftcard ? is_giftcard === "true" : undefined,
    order: order || "-created_at",
    tag_id: tag_id ? tag_id.split(",") : undefined,
    type_id: type_id?.split(","),
    status: status?.split(",") as HttpTypes.AdminProductStatus[],
    has_pending_change: has_pending_change === "true" ? true : undefined,
    mine: withMine && mine !== "false" ? true : undefined,
    q,
    fields: linkQuery.fields,
  };

  return {
    searchParams,
    raw: queryObject,
  };
};
