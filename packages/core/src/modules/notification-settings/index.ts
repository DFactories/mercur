import { Module } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import NotificationSettingsModuleService from "./service"

export default Module(MercurModules.NOTIFICATION_SETTINGS, {
  service: NotificationSettingsModuleService,
})
