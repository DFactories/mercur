import {
  ClientError,
  InferClientInput,
  InferClientOutput,
} from "@mercurjs/client"
import {
  QueryKey,
  UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { fetchQuery, sdk } from "../../lib/client"
import { queryKeysFactory } from "../../lib/query-key-factory"

const NOTIFICATION_QUERY_KEY = "notification" as const
export const notificationQueryKeys = queryKeysFactory(NOTIFICATION_QUERY_KEY)

const NOTIFICATION_READ_STATE_QUERY_KEY = "notification-read-state" as const
export const notificationReadStateQueryKeys = queryKeysFactory(
  NOTIFICATION_READ_STATE_QUERY_KEY
)

type NotificationReadState = { last_read_at: string | null }

/**
 * Where this operator has read up to. Server-side and per admin user: the feed
 * is a broadcast, so read state cannot live on the notification, and
 * localStorage made it per browser instead of per person.
 */
export const useNotificationReadState = (
  options?: Omit<
    UseQueryOptions<
      NotificationReadState,
      ClientError,
      NotificationReadState,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: notificationReadStateQueryKeys.all,
    queryFn: async () =>
      (await fetchQuery("/admin/notification-read-state", {
        method: "GET",
      })) as NotificationReadState,
    ...options,
  })

  return { ...data, ...rest }
}

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () =>
      (await fetchQuery("/admin/notification-read-state", {
        method: "POST",
      })) as NotificationReadState,
    onSuccess: (data) => {
      queryClient.setQueryData(notificationReadStateQueryKeys.all, data)
    },
  })
}

export const useNotification = (
  id: string,
  query?: Omit<
    InferClientInput<typeof sdk.admin.notifications.$id.query>,
    "$id"
  >,
  options?: Omit<
    UseQueryOptions<
      InferClientOutput<typeof sdk.admin.notifications.$id.query>,
      ClientError,
      InferClientOutput<typeof sdk.admin.notifications.$id.query>,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: notificationQueryKeys.detail(id),
    queryFn: () => sdk.admin.notifications.$id.query({ $id: id, ...query }),
    ...options,
  })

  return { ...data, ...rest }
}

export const useNotifications = (
  query?: InferClientInput<typeof sdk.admin.notifications.query>,
  options?: Omit<
    UseQueryOptions<
      InferClientOutput<typeof sdk.admin.notifications.query>,
      ClientError,
      InferClientOutput<typeof sdk.admin.notifications.query>,
      QueryKey
    >,
    "queryFn" | "queryKey"
  >
) => {
  const { data, ...rest } = useQuery({
    queryFn: () => sdk.admin.notifications.query({ ...query }),
    queryKey: notificationQueryKeys.list(query),
    ...options,
  })

  return { ...data, ...rest }
}
