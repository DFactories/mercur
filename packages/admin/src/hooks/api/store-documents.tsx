import { useMutation, useQuery } from "@tanstack/react-query";

import {
  fetchQuery,
  StoreDocumentsResponse,
  StoreDocumentType,
  uploadSellerStoreDocumentsQuery,
} from "../../lib/client";
import { queryClient } from "../../lib/query-client";
import { queryKeysFactory } from "../../lib/query-key-factory";
import { sellersQueryKeys } from "./sellers";

/**
 * DFACTORIES: a store's business license and health permit.
 *
 * They live in the host's PRIVATE bucket. The seller record only holds an
 * object key; the link shown here is a presigned URL minted per request, which
 * expires — so the query refreshes itself before the shortest one does.
 */
const STORE_DOCUMENTS_QUERY_KEY = "seller-store-documents" as const;
export const sellerStoreDocumentsQueryKeys = queryKeysFactory(
  STORE_DOCUMENTS_QUERY_KEY,
);

/** Refresh at 80% of the shortest lifetime; never when nothing expires. */
const refreshBeforeExpiry = (data?: StoreDocumentsResponse) => {
  const lifetimes = Object.values(data?.store_documents ?? {})
    .map((doc) => doc?.expires_in)
    .filter((seconds): seconds is number => !!seconds && seconds > 0);
  return lifetimes.length ? Math.min(...lifetimes) * 800 : false;
};

export const useSellerStoreDocuments = (sellerId: string) => {
  const { data, ...rest } = useQuery({
    queryKey: sellerStoreDocumentsQueryKeys.detail(sellerId),
    queryFn: async () =>
      (await fetchQuery(`/admin/sellers/${sellerId}/store-documents`, {
        method: "GET",
      })) as StoreDocumentsResponse,
    refetchInterval: (query) => refreshBeforeExpiry(query.state.data),
    retry: false,
  });

  return { store_documents: data?.store_documents, ...rest };
};

const invalidate = (sellerId: string) => {
  queryClient.invalidateQueries({
    queryKey: sellerStoreDocumentsQueryKeys.detail(sellerId),
  });
  // The store page reads `professional_details` to tell "provided" from
  // "not provided". `.all`: a detail key carries its query object, which a
  // bare `detail(id)` would not match.
  queryClient.invalidateQueries({ queryKey: sellersQueryKeys.all });
};

export const useUploadSellerStoreDocuments = (sellerId: string) =>
  useMutation({
    mutationFn: async (files: Partial<Record<StoreDocumentType, File>>) => {
      const formData = new FormData();
      for (const [type, file] of Object.entries(files)) {
        if (file) {
          formData.append(type, file);
        }
      }
      return uploadSellerStoreDocumentsQuery(sellerId, formData);
    },
    onSuccess: () => invalidate(sellerId),
  });

export const useDeleteSellerStoreDocument = (sellerId: string) =>
  useMutation({
    mutationFn: async (type: StoreDocumentType) =>
      (await fetchQuery(`/admin/sellers/${sellerId}/store-documents/${type}`, {
        method: "DELETE",
      })) as StoreDocumentsResponse,
    onSuccess: () => invalidate(sellerId),
  });
