import { ModuleProvider, Modules } from "@medusajs/framework/utils"

import SmsIrNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [SmsIrNotificationProviderService],
})
