import {
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";

import {
  fetchQuery,
  StoreDocumentsResponse,
  StoreDocumentType,
  uploadStoreDocumentsQuery,
} from "../../lib/client";
import { queryClient } from "../../lib/query-client";
import { queryKeysFactory } from "../../lib/query-key-factory";
import { membersQueryKeys } from "./members";
import { sellersQueryKeys } from "./sellers";

/**
 * DFACTORIES: the store's business license and health permit.
 *
 * These live in the host's PRIVATE bucket (`/vendor/store-documents`). The
 * seller record only holds an object key; what the panel shows is a presigned
 * URL minted per request, which expires — so the query refreshes itself before
 * the shortest one does, and a link left open on screen keeps working.
 */
const STORE_DOCUMENTS_QUERY_KEY = "store-documents" as const;
export const storeDocumentsQueryKeys = queryKeysFactory(
  STORE_DOCUMENTS_QUERY_KEY,
);

/** Refresh at 80% of the shortest lifetime; never when nothing expires. */
const refreshBeforeExpiry = (data?: StoreDocumentsResponse) => {
  const lifetimes = Object.values(data?.store_documents ?? {})
    .map((doc) => doc?.expires_in)
    .filter((seconds): seconds is number => !!seconds && seconds > 0);
  return lifetimes.length ? Math.min(...lifetimes) * 800 : false;
};

export const useStoreDocuments = (
  options?: Omit<
    UseQueryOptions<StoreDocumentsResponse, Error, StoreDocumentsResponse>,
    "queryKey" | "queryFn"
  >,
) => {
  const { data, ...rest } = useQuery({
    queryKey: storeDocumentsQueryKeys.all,
    queryFn: async () =>
      (await fetchQuery("/vendor/store-documents", {
        method: "GET",
      })) as StoreDocumentsResponse,
    refetchInterval: (query) => refreshBeforeExpiry(query.state.data),
    // A 403 (a seat without `seller:read`) will not change on retry.
    retry: false,
    ...options,
  });

  return { store_documents: data?.store_documents, ...rest };
};

const invalidate = () => {
  queryClient.invalidateQueries({ queryKey: storeDocumentsQueryKeys.all });
  // The seller in `/me` carries `professional_details`, which the section
  // reads to tell "provided" from "not provided".
  queryClient.invalidateQueries({ queryKey: sellersQueryKeys.all });
  queryClient.invalidateQueries({ queryKey: membersQueryKeys.me() });
};

export const useUploadStoreDocuments = () =>
  useMutation({
    mutationFn: async (files: Partial<Record<StoreDocumentType, File>>) => {
      const formData = new FormData();
      for (const [type, file] of Object.entries(files)) {
        if (file) {
          formData.append(type, file);
        }
      }
      return uploadStoreDocumentsQuery(formData);
    },
    onSuccess: invalidate,
  });

export const useDeleteStoreDocument = () =>
  useMutation({
    mutationFn: async (type: StoreDocumentType) =>
      (await fetchQuery(`/vendor/store-documents/${type}`, {
        method: "DELETE",
      })) as StoreDocumentsResponse,
    onSuccess: invalidate,
  });
