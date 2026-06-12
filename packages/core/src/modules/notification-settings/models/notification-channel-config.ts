import { model } from "@medusajs/framework/utils"

/**
 * Per-event, per-channel notification configuration (the `event × channel`
 * table). Mutable half of the hybrid catalog: operators flip channels on/off
 * and paste approved sms.ir template ids here without a deploy. Credentials
 * (the sms.ir API key) stay in env — only template ids live here.
 */
const NotificationChannelConfig = model
  .define("notification_channel_config", {
    id: model.id({ prefix: "ncc" }).primaryKey(),
    event_key: model.text(),
    channel: model.text(),
    enabled: model.boolean().default(false),
    /** sms.ir approved template id (SMS) or email template ref. */
    template_id: model.text().nullable(),
    /** Optional mapping of event payload fields to template parameters. */
    params_map: model.json().nullable(),
    /** Optional email subject override. */
    subject: model.text().nullable(),
  })
  .indexes([
    {
      on: ["event_key", "channel"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default NotificationChannelConfig
