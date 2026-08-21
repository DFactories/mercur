import {
  BellAlert,
  BellAlertDone,
  InformationCircleSolid,
} from "@medusajs/icons"
import { HttpTypes } from "@medusajs/types"
import { clx, Drawer, Heading, IconButton, Text } from "@medusajs/ui"
import { formatDistance } from "date-fns"
import { TFunction } from "i18next"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  notificationQueryKeys,
  useMarkNotificationsRead,
  useNotificationReadState,
  useNotifications,
} from "../../../hooks/api"
import { fetchQuery } from "../../../lib/client"
import { FilePreview } from "../../common/file-preview"
import { InfiniteList } from "../../common/infinite-list"

interface NotificationData {
  title: string
  description?: string
  file?: {
    filename?: string
    url?: string
    mimeType?: string
  }
}

export const Notifications = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { last_read_at: serverLastReadAt } = useNotificationReadState()
  const { mutate: markRead } = useMarkNotificationsRead()
  const [hasUnread, setHasUnread] = useUnreadNotifications(serverLastReadAt)
  // Lags behind the persisted marker on purpose: rows opened in this session
  // keep their unread dot until the drawer closes.
  const [lastReadAt, setLastReadAt] = useState<string | null | undefined>(
    serverLastReadAt
  )

  // Seed the displayed marker once the persisted value arrives.
  useEffect(() => {
    if (!open) {
      setLastReadAt(serverLastReadAt)
    }
  }, [serverLastReadAt, open])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "n" && (e.metaKey || e.ctrlKey)) {
        setOpen((prev) => !prev)
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  const handleOnOpen = (shouldOpen: boolean) => {
    if (shouldOpen) {
      setHasUnread(false)
      setOpen(true)
      markRead()
    } else {
      setOpen(false)
      setLastReadAt(serverLastReadAt)
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOnOpen}>
      <Drawer.Trigger asChild>
        <IconButton
          variant="transparent"
          size="small"
          className="text-ui-fg-muted hover:text-ui-fg-subtle"
        >
          {hasUnread ? <BellAlertDone /> : <BellAlert />}
        </IconButton>
      </Drawer.Trigger>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title asChild>
            <Heading>{t("notifications.domain")}</Heading>
          </Drawer.Title>
          <Drawer.Description className="sr-only">
            {t("notifications.accessibility.description")}
          </Drawer.Description>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto px-0">
          <InfiniteList<
            HttpTypes.AdminNotificationListResponse,
            HttpTypes.AdminNotification,
            HttpTypes.AdminNotificationListParams
          >
            responseKey="notifications"
            queryKey={notificationQueryKeys.all}
            queryFn={(params: any) =>
              fetchQuery(`/vendor/notifications`, {
                method: "GET",
                query: { ...params },
              })
            }
            queryOptions={{ enabled: open }}
            renderEmpty={() => <NotificationsEmptyState t={t} />}
            renderItem={(notification) => {
              return (
                <Notification
                  key={notification.id}
                  notification={notification}
                  unread={
                    Date.parse(notification.created_at) >
                    (lastReadAt ? Date.parse(lastReadAt) : 0)
                  }
                />
              )
            }}
          />
        </Drawer.Body>
      </Drawer.Content>
    </Drawer>
  )
}

const Notification = ({
  notification,
  unread,
}: {
  notification: HttpTypes.AdminNotification
  unread?: boolean
}) => {
  const data = notification.data as unknown as NotificationData | undefined

  // We need at least the title to render a notification in the feed
  if (!data?.title) {
    return null
  }

  return (
    <>
      <div className="relative flex items-start justify-center gap-3 border-b p-6">
        <div className="text-ui-fg-muted flex size-5 items-center justify-center">
          <InformationCircleSolid />
        </div>
        <div className="flex w-full flex-col gap-y-3">
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <Text size="small" leading="compact" weight="plus">
                {data.title}
              </Text>
              <div className="align-center flex items-center justify-center gap-2">
                <Text
                  as={"span"}
                  className={clx("text-ui-fg-subtle", {
                    "text-ui-fg-base": unread,
                  })}
                  size="small"
                  leading="compact"
                  weight="plus"
                >
                  {formatDistance(notification.created_at, new Date(), {
                    addSuffix: true,
                  })}
                </Text>
                {unread && (
                  <div
                    className="bg-ui-bg-interactive h-2 w-2 rounded"
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                    role="status"
                  />
                )}
              </div>
            </div>
            {!!data.description && (
              <Text
                className="text-ui-fg-subtle whitespace-pre-line"
                size="small"
              >
                {data.description}
              </Text>
            )}
          </div>
          {!!data?.file?.url && (
            <FilePreview
              filename={data.file.filename ?? ""}
              url={data.file.url}
              hideThumbnail
            />
          )}
        </div>
      </div>
    </>
  )
}

const NotificationsEmptyState = ({ t }: { t: TFunction }) => {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <BellAlertDone />
      <Text size="small" leading="compact" weight="plus" className="mt-3">
        {t("notifications.emptyState.title")}
      </Text>
      <Text
        size="small"
        className="text-ui-fg-muted mt-1 max-w-[294px] text-center"
      >
        {t("notifications.emptyState.description")}
      </Text>
    </div>
  )
}

const useUnreadNotifications = (lastReadAt: string | null | undefined) => {
  const [hasUnread, setHasUnread] = useState(false)
  const { notifications } = useNotifications(
    { limit: 1, offset: 0, fields: "created_at" },
    { refetchInterval: 60_000 }
  )
  const lastNotification = notifications?.[0]

  useEffect(() => {
    if (!lastNotification) {
      return
    }

    const lastNotificationAsTimestamp = Date.parse(lastNotification.created_at)
    const lastReadAsTimestamp = lastReadAt ? Date.parse(lastReadAt) : 0

    setHasUnread(lastNotificationAsTimestamp > lastReadAsTimestamp)
  }, [lastNotification, lastReadAt])

  return [hasUnread, setHasUnread] as const
}
