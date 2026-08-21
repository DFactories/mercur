import { useEffect, useMemo, useState } from "react"

import { Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  IconButton,
  Input,
  Select,
  Switch,
  Text,
  Tooltip,
  clx,
  toast,
} from "@medusajs/ui"
import {
  NotificationEventConfigDTO,
  NotificationVariableDef,
} from "@mercurjs/types"
import { useTranslation } from "react-i18next"

import { SingleColumnPage } from "../../components/layout/pages"
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "../../hooks/api/notification-settings"

type ParamRow = { name: string; variable: string }
type ChannelEdit = {
  enabled: boolean
  template_id: string | null
  subject: string | null
  paramRows: ParamRow[]
}
type EditState = Record<string, ChannelEdit>

const keyOf = (eventKey: string, channel: string) => `${eventKey}:${channel}`

const AUDIENCE_ORDER: NotificationEventConfigDTO["audience"][] = [
  "customer",
  "vendor",
  "admin",
]

const channelStateFrom = (
  ch: {
    enabled: boolean
    template_id: string | null
    template_required: boolean
    params_map: Record<string, unknown> | null
    subject: string | null
  },
  variables: NotificationVariableDef[]
): ChannelEdit => {
  const savedRows = Object.entries(ch.params_map ?? {}).map(([name, variable]) => ({
    name,
    variable: String(variable ?? ""),
  }))
  // Pre-seed the SMS parameters with the convention (one row per variable, named
  // after its key) so the operator immediately sees exactly which parameters
  // their sms.ir template will receive — they can rename to match their
  // template's placeholders or remove any the template doesn't use.
  const paramRows =
    savedRows.length || !ch.template_required
      ? savedRows
      : variables.map((v) => ({ name: v.key, variable: v.key }))
  return {
    enabled: ch.enabled,
    template_id: ch.template_id,
    subject: ch.subject,
    paramRows,
  }
}

const paramRowsToMap = (rows: ParamRow[]): Record<string, string> | null => {
  const map: Record<string, string> = {}
  for (const { name, variable } of rows) {
    const n = name.trim()
    if (n && variable) {
      map[n] = variable
    }
  }
  return Object.keys(map).length ? map : null
}

// --- Available-variables strip (click-to-copy documentation) ---------------
const VariableChips = ({
  variables,
}: {
  variables: NotificationVariableDef[]
}) => {
  const { t } = useTranslation()
  if (!variables.length) {
    return null
  }
  const copy = (key: string) => {
    navigator.clipboard?.writeText(key)
    toast.success(t("notificationSettings.variables.copied", { key }))
  }
  return (
    <div className="flex flex-col gap-y-1">
      <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
        {t("notificationSettings.variables.title")}
      </Text>
      <div className="flex flex-wrap gap-1.5">
        {variables.map((v) => (
          <Tooltip
            key={v.key}
            content={
              v.example
                ? `${v.label} · ${t("notificationSettings.variables.example", {
                    example: v.example,
                  })}`
                : v.label
            }
          >
            <button
              type="button"
              onClick={() => copy(v.key)}
              className="text-ui-fg-subtle hover:bg-ui-bg-base-hover bg-ui-bg-subtle rounded-md px-2 py-0.5 font-mono text-xs transition-colors"
            >
              {v.key}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

// --- params_map editor (sms/email) -----------------------------------------
const ParamsMapEditor = ({
  rows,
  variables,
  onChange,
  testIdPrefix,
}: {
  rows: ParamRow[]
  variables: NotificationVariableDef[]
  onChange: (rows: ParamRow[]) => void
  testIdPrefix: string
}) => {
  const { t } = useTranslation()
  const variableKeys = useMemo(() => new Set(variables.map((v) => v.key)), [
    variables,
  ])

  const update = (index: number, patch: Partial<ParamRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  const remove = (index: number) =>
    onChange(rows.filter((_, i) => i !== index))
  const add = () => onChange([...rows, { name: "", variable: "" }])

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-col">
        <Text size="xsmall" weight="plus" className="text-ui-fg-muted">
          {t("notificationSettings.params.title")}
        </Text>
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("notificationSettings.params.hint")}
        </Text>
      </div>
      {rows.map((row, index) => {
        const unknown = !!row.variable && !variableKeys.has(row.variable)
        return (
          <div key={index} className="flex items-center gap-x-2">
            <Input
              size="small"
              className="w-44"
              placeholder={t("notificationSettings.params.namePlaceholder")}
              value={row.name}
              onChange={(e) => update(index, { name: e.target.value })}
              data-testid={`${testIdPrefix}-param-name-${index}`}
            />
            <Text size="small" className="text-ui-fg-muted">
              ←
            </Text>
            <Select
              size="small"
              value={row.variable}
              onValueChange={(value) => update(index, { variable: value })}
            >
              <Select.Trigger
                className="w-44"
                data-testid={`${testIdPrefix}-param-var-${index}`}
              >
                <Select.Value
                  placeholder={t(
                    "notificationSettings.params.variablePlaceholder"
                  )}
                />
              </Select.Trigger>
              <Select.Content>
                {variables.map((v) => (
                  <Select.Item key={v.key} value={v.key}>
                    {v.key}
                  </Select.Item>
                ))}
                {/* Keep an unknown (drifted) mapping selectable so it isn't silently dropped. */}
                {unknown && (
                  <Select.Item value={row.variable}>{row.variable}</Select.Item>
                )}
              </Select.Content>
            </Select>
            {unknown && (
              <Badge size="2xsmall" color="orange">
                {t("notificationSettings.params.unknownVar")}
              </Badge>
            )}
            <IconButton
              size="small"
              variant="transparent"
              onClick={() => remove(index)}
              data-testid={`${testIdPrefix}-param-remove-${index}`}
            >
              <Trash />
            </IconButton>
          </div>
        )
      })}
      <div>
        <Button
          size="small"
          variant="secondary"
          onClick={add}
          disabled={!variables.length}
          data-testid={`${testIdPrefix}-param-add`}
        >
          {t("notificationSettings.params.add")}
        </Button>
      </div>
    </div>
  )
}

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
  const variables = event.variables ?? []

  return (
    <div className="flex flex-col gap-y-4 px-6 py-4">
      <div className="flex flex-col">
        <Text size="small" weight="plus">
          {event.label}
        </Text>
        {event.description && (
          <Text size="small" className="text-ui-fg-subtle">
            {event.description}
          </Text>
        )}
      </div>

      <VariableChips variables={variables} />

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
        <div className="flex flex-col gap-y-4">
          {event.channels.map((ch) => {
            const key = keyOf(event.event_key, ch.channel)
            const state = edits[key] ?? channelStateFrom(ch, variables)
            const hasTemplate = !!state.template_id?.trim()
            const canEnable = !ch.template_required || hasTemplate
            // Only SMS is template-param driven on sms.ir; email + feed channels
            // carry a free-text subject/title override instead.
            const isSms = ch.template_required

            return (
              <div
                key={ch.channel}
                className="border-ui-border-base flex flex-col gap-y-3 rounded-lg border p-3"
              >
                <div className="flex items-center justify-between gap-x-3">
                  <Text size="small" weight="plus" className="text-ui-fg-subtle">
                    {t(`notificationSettings.channel.${ch.channel}`)}
                  </Text>
                  <div className="flex items-center gap-x-3">
                    {ch.template_required && (
                      <Input
                        size="small"
                        className="w-44"
                        placeholder={t(
                          "notificationSettings.templateIdPlaceholder"
                        )}
                        value={state.template_id ?? ""}
                        onChange={(e) =>
                          onChange(key, {
                            template_id: e.target.value || null,
                          })
                        }
                        data-testid={`template-${key}`}
                      />
                    )}
                    <Switch
                      checked={state.enabled && canEnable}
                      disabled={!canEnable}
                      onCheckedChange={(value) =>
                        onChange(key, { enabled: value })
                      }
                      data-testid={`switch-${key}`}
                    />
                  </div>
                </div>

                {isSms ? (
                  <ParamsMapEditor
                    rows={state.paramRows}
                    variables={variables}
                    onChange={(paramRows) => onChange(key, { paramRows })}
                    testIdPrefix={key}
                  />
                ) : (
                  <Input
                    size="small"
                    placeholder={t("notificationSettings.subjectPlaceholder")}
                    value={state.subject ?? ""}
                    onChange={(e) =>
                      onChange(key, { subject: e.target.value || null })
                    }
                    data-testid={`subject-${key}`}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
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
        init[keyOf(event.event_key, ch.channel)] = channelStateFrom(
          ch,
          event.variables ?? []
        )
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
          const state = edits[key] ?? channelStateFrom(ch, event.variables ?? [])
          return {
            event_key: event.event_key,
            channel: ch.channel,
            enabled: state.enabled,
            template_id: state.template_id,
            params_map: paramRowsToMap(state.paramRows),
            subject: state.subject,
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
            <Container key={audience} className={clx("divide-y p-0")}>
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
