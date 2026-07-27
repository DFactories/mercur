import { z } from "zod"

export const AdminUpdateNotificationSettings = z.object({
  updates: z
    .array(
      z.object({
        event_key: z.string(),
        channel: z.enum(["email", "sms", "feed", "seller_feed"]),
        enabled: z.boolean().optional(),
        template_id: z.string().nullable().optional(),
        params_map: z.record(z.string(), z.unknown()).nullable().optional(),
        subject: z.string().nullable().optional(),
      })
    )
    .min(1),
})

export type AdminUpdateNotificationSettingsType = z.infer<
  typeof AdminUpdateNotificationSettings
>
