import { useEffect, useMemo, useState } from "react"

import { Badge, Button, Container, Heading, Input, Switch, Text, toast } from "@medusajs/ui"
import { NotificationEventConfigDTO } from "@mercurjs/types"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../components/layout/pages"
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "../../hooks/api/notification-settings"

type ChannelEdit = { enabled: boolean; template_id: string | null }
type EditState = Record<string, ChannelEdit>

const keyOf = (eventKey: string, channel: string) => `${eventKey}:${channel}`

const AUDIENCE_ORDER: NotificationEventConfigDTO["audience"][] = [
  "customer",
  "vendor",
  "admin",
]

const EventRow = ({
  event,
  edits,
  onChange,
}: {
  event: NotificationEventConfigDTO
  edits: EditState
  onChange: (key: string, patch: Partial<ChannelEdit>) => void
}) => {
  const { t } = useTranslation()

  return (
    <div className="flex items-start justify-between gap-x-4 px-6 py-4">
      <div className="flex max-w-[55%] flex-col">
        <Text size="small" weight="plus">
          {event.label}
        </Text>
        {event.description && (
          <Text size="small" className="text-ui-fg-subtle">
            {event.description}
          </Text>
        )}
      </div>

      <div className="flex flex-col items-end gap-y-3">
        {event.system ? (
          <div className="flex items-center gap-x-2">
            <Badge size="2xsmall" color="grey">
              {t("notificationSettings.systemManaged")}
            </Badge>
            {event.available_channels.map((c) => (
              <Badge key={c} size="2xsmall">
                {t(`notificationSettings.channel.${c}`)}
              </Badge>
            ))}
          </div>
        ) : (
          event.channels.map((ch) => {
            const key = keyOf(event.event_key, ch.channel)
            const state = edits[key] ?? {
              enabled: ch.enabled,
              template_id: ch.template_id,
            }
            const hasTemplate = !!state.template_id?.trim()
            const canEnable = !ch.template_required || hasTemplate

            return (
              <div key={ch.channel} className="flex items-center gap-x-3">
                {ch.template_required && (
                  <Input
                    size="small"
                    className="w-44"
                    placeholder={t("notificationSettings.templateIdPlaceholder")}
                    value={state.template_id ?? ""}
                    onChange={(e) =>
                      onChange(key, { template_id: e.target.value || null })
                    }
                    data-testid={`template-${key}`}
                  />
                )}
                <div className="flex w-20 items-center justify-end gap-x-2">
                  <Text size="small" className="text-ui-fg-subtle">
                    {t(`notificationSettings.channel.${ch.channel}`)}
                  </Text>
                  <Switch
                    checked={state.enabled && canEnable}
                    disabled={!canEnable}
                    onCheckedChange={(value) => onChange(key, { enabled: value })}
                    data-testid={`switch-${key}`}
                  />
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const Root = () => {
  const { t } = useTranslation()
  const { notification_settings, isPending, isError, error } =
    useNotificationSettings()
  const { mutateAsync, isPending: isSaving } = useUpdateNotificationSettings()

  const [edits, setEdits] = useState<EditState>({})
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (initialized || !notification_settings) {
      return
    }
    const init: EditState = {}
    for (const event of notification_settings) {
      if (event.system) {
        continue
      }
      for (const ch of event.channels) {
        init[keyOf(event.event_key, ch.channel)] = {
          enabled: ch.enabled,
          template_id: ch.template_id,
        }
      }
    }
    setEdits(init)
    setInitialized(true)
  }, [notification_settings, initialized])

  if (isError) {
    throw error
  }

  const events = useMemo(
    () => notification_settings ?? [],
    [notification_settings]
  )

  const grouped = useMemo(() => {
    const groups: Partial<Record<string, NotificationEventConfigDTO[]>> = {}
    for (const event of events) {
      ;(groups[event.audience] ??= []).push(event)
    }
    return groups
  }, [events])

  const onChange = (key: string, patch: Partial<ChannelEdit>) =>
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }))

  const handleSave = async () => {
    const updates = events
      .filter((event) => !event.system)
      .flatMap((event) =>
        event.channels.map((ch) => {
          const key = keyOf(event.event_key, ch.channel)
          const state = edits[key] ?? {
            enabled: ch.enabled,
            template_id: ch.template_id,
          }
          return {
            event_key: event.event_key,
            channel: ch.channel,
            enabled: state.enabled,
            template_id: state.template_id,
          }
        })
      )

    try {
      await mutateAsync({ updates })
      toast.success(t("notificationSettings.toast.saved"))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const ready = !isPending && !!notification_settings

  return (
    <SingleColumnPage hasOutlet={false}>
      <Container className="p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex flex-col">
            <Heading>{t("notificationSettings.domain")}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {t("notificationSettings.subtitle")}
            </Text>
          </div>
          <Button
            size="small"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!ready}
            data-testid="save-notification-settings"
          >
            {t("actions.save")}
          </Button>
        </div>
      </Container>

      {ready &&
        AUDIENCE_ORDER.filter((audience) => grouped[audience]?.length).map(
          (audience) => (
            <Container key={audience} className="divide-y p-0">
              <div className="px-6 py-4">
                <Heading level="h2">
                  {t(`notificationSettings.audience.${audience}`)}
                </Heading>
              </div>
              {grouped[audience]!.map((event) => (
                <EventRow
                  key={event.event_key}
                  event={event}
                  edits={edits}
                  onChange={onChange}
                />
              ))}
            </Container>
          )
        )}
    </SingleColumnPage>
  )
}

export const NotificationSettingsPage = Object.assign(Root, {
  EventRow,
})
