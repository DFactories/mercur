import { useMutation, useQuery } from "@tanstack/react-query";
import type { UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";

import { sdk } from "../../lib/client";
import { queryClient } from "../../lib/query-client";
import { queryKeysFactory } from "../../lib/query-key-factory";
import type {
  ClientError,
  InferClientInput,
  InferClientOutput,
} from "@mercurjs/client";
import { sellerMembersQueryKeys } from "./sellers";

const MEMBERS_QUERY_KEY = "members" as const;
export const membersQueryKeys = queryKeysFactory(MEMBERS_QUERY_KEY);

export const useMembers = (
  query?: { q?: string; limit?: number; offset?: number; email?: string },
  options?: Omit<UseQueryOptions<any, ClientError>, "queryKey" | "queryFn">,
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.members.query(query as any),
    queryKey: membersQueryKeys.list(query ?? {}),
    ...options,
  });

  return { ...data, ...rest };
};

/**
 * Change a member's SIGN-IN number.
 *
 * The vendor panel is opened with this number — `seller.phone` is the store's
 * public contact and is edited on the store form instead. The backend moves the
 * phone-OTP login identity with it; see `POST /admin/members/:id/phone`.
 */
export const useUpdateMemberPhone = (
  memberId: string,
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.admin.members.$id.phone.mutate>,
    ClientError,
    Omit<InferClientInput<typeof sdk.admin.members.$id.phone.mutate>, "$id">
  >,
) => {
  return useMutation({
    mutationFn: (payload) =>
      sdk.admin.members.$id.phone.mutate({ $id: memberId, ...payload }),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: membersQueryKeys.all });
      // The store page reads members through the seller, not through /members.
      queryClient.invalidateQueries({ queryKey: sellerMembersQueryKeys.all });

      options?.onSuccess?.(data, variables, context);
    },
    ...options,
  });
};
