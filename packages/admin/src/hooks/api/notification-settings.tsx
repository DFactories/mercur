import {
  ClientError,
  InferClientInput,
  InferClientOutput,
} from "@mercurjs/client"
import {
  QueryKey,
  UseMutationOptions,
  UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query"

import { sdk } from "../../lib/client"
import { queryClient } from "../../lib/query-client"
import { queryKeysFactory } from "../../lib/query-key-factory"

const NOTIFICATION_SETTINGS_QUERY_KEY = "notification_settings" as const
export const notificationSettingsQueryKeys = queryKeysFactory(
  NOTIFICATION_SETTINGS_QUERY_KEY
)

export const useNotificationSettings = (
  options?: Omit<
    UseQueryOptions<
      InferClientOutput<typeof sdk.admin.notificationSettings.query>,
      ClientError,
      InferClientOutput<typeof sdk.admin.notificationSettings.query>,
      QueryKey
    >,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.notificationSettings.query(),
    queryKey: notificationSettingsQueryKeys.list(),
    ...options,
  })

  return { ...data, ...rest }
}

export const useUpdateNotificationSettings = (
  options?: UseMutationOptions<
    InferClientOutput<typeof sdk.admin.notificationSettings.mutate>,
    ClientError,
    InferClientInput<typeof sdk.admin.notificationSettings.mutate>
  >
) => {
  return useMutation({
    mutationFn: (payload) => sdk.admin.notificationSettings.mutate(payload),
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({
        queryKey: notificationSettingsQueryKeys.lists(),
      })

      options?.onSuccess?.(data, variables, context)
    },
    ...options,
  })
}
