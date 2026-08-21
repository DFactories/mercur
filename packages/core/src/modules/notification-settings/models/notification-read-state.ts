import { model } from "@medusajs/framework/utils"

/**
 * How far each actor has read their notification feed.
 *
 * Feed rows are addressed to an audience (`to: "admin"` is a broadcast to every
 * operator, `to: <seller_id>` to a store), so "read" cannot live on the
 * notification itself — two operators read the same row independently. It also
 * cannot live in localStorage, which is per browser rather than per person and
 * resets on a new machine or a cleared profile.
 */
const NotificationReadState = model
  .define("notification_read_state", {
    id: model.id({ prefix: "nrs" }).primaryKey(),
    /** "user" for an operator, "member" for a seller member. */
    actor_type: model.text(),
    actor_id: model.text(),
    last_read_at: model.dateTime(),
  })
  .indexes([
    {
      on: ["actor_type", "actor_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default NotificationReadState
