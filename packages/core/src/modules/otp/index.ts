import { Module } from "@medusajs/framework/utils"
import { MercurModules } from "@mercurjs/types"

import OtpModuleService from "./service"

export default Module(MercurModules.OTP, {
  service: OtpModuleService,
})
