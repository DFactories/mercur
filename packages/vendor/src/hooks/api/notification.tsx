import {
  UseQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { fetchQuery } from "../../lib/client";
import { queryKeysFactory } from "../../lib/query-key-factory";

const NOTIFICATION_QUERY_KEY = "notification" as const;
export const notificationQueryKeys = queryKeysFactory(NOTIFICATION_QUERY_KEY);

const NOTIFICATION_READ_STATE_QUERY_KEY = "notification-read-state" as const;
export const notificationReadStateQueryKeys = queryKeysFactory(
  NOTIFICATION_READ_STATE_QUERY_KEY
);

type NotificationReadState = { last_read_at: string | null };

/**
 * Where this member has read up to. Server-side and per member, so the marker
 * survives a new browser and is not shared with the store's other members.
 */
export const useNotificationReadState = (
  options?: Omit<
    UseQueryOptions<NotificationReadState, Error, NotificationReadState>,
    "queryKey" | "queryFn"
  >
) => {
  const { data, ...rest } = useQuery({
    queryKey: notificationReadStateQueryKeys.all,
    queryFn: async () =>
      (await fetchQuery("/vendor/notification-read-state", {
        method: "GET",
      })) as NotificationReadState,
    ...options,
  });

  return { ...data, ...rest };
};

export const useMarkNotificationsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      (await fetchQuery("/vendor/notification-read-state", {
        method: "POST",
      })) as NotificationReadState,
    onSuccess: (data) => {
      queryClient.setQueryData(notificationReadStateQueryKeys.all, data);
    },
  });
};

export const useNotification = (
  id: string,
  query?: Record<string, any>,
  options?: Omit<UseQueryOptions<any, Error, any>, "queryKey" | "queryFn">
) => {
  const { data, ...rest } = useQuery({
    queryKey: notificationQueryKeys.detail(id),
    queryFn: async () =>
      fetchQuery(`/vendor/notifications/${id}`, {
        method: "GET",
        query,
      }),
    ...options,
  });

  return { ...data, ...rest };
};

export const useNotifications = (
  query?: Record<string, any>,
  options?: Omit<UseQueryOptions<any, Error, any>, "queryKey" | "queryFn">
) => {
  const { data, ...rest } = useQuery({
    queryFn: () =>
      fetchQuery(`/vendor/notifications`, {
        method: "GET",
        query,
      }),
    queryKey: notificationQueryKeys.list(query),
    ...options,
  });

  return { ...data, ...rest };
};
