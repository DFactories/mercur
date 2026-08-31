import type { InputConfigWithArrayModules } from "@medusajs/framework/types"
import { defineConfig } from '@medusajs/framework/utils'
import { applyMercurPatches } from "./patches"
import { disableMedusaMiddlewares } from "./utils/disable-medusa-middlewares"

type HttpConfig = NonNullable<NonNullable<InputConfigWithArrayModules["projectConfig"]>["http"]>

export type MercurInputConfig = Omit<InputConfigWithArrayModules, "projectConfig"> & {
  projectConfig?: Omit<NonNullable<InputConfigWithArrayModules["projectConfig"]>, "http"> & {
    http?: HttpConfig & {
      vendorCors?: string
    }
    mercur?: {
      /**
       * Patch file names to skip, e.g. "@medusajs+core-flows@2.18.0.patch".
       * Each one restores an upstream bug, so only reach for this when a patch
       * conflicts with your own override.
       */
      disabledPatches?: string[]
    }
  }
}

export function withMercur(config: MercurInputConfig = {}): InputConfigWithArrayModules {
  // Before `disableMedusaMiddlewares`, which requires Medusa middleware modules
  // that pull in `@medusajs/core-flows` transitively. Patches are compiled on
  // first require, so anything that loads the targeted modules must run after
  // this. Medusa itself imports core-flows lazily, well after `medusa-config`
  // is evaluated, which is what leaves this window open at all.
  applyMercurPatches({
    disabled: config.projectConfig?.mercur?.disabledPatches,
  })
  disableMedusaMiddlewares()

  const projectConfig = {
    ...config.projectConfig,
    http: {
      ...config.projectConfig?.http,
    } as any,
  }

  const admin = {
    ...config.admin,
    disable: config.admin?.disable ?? true,
  }

  const featureFlags = {
    ...config.featureFlags,
    rbac: true,
    phone_auth: config.featureFlags?.phone_auth ?? true,
  }

  const userModules = config.modules ?? []

  const hasModule = (resolve: string) =>
    userModules.some(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        "resolve" in m &&
        m.resolve === resolve
    )

  // Auto-register the Notification module (if the consumer hasn't configured
  // their own) with the sms.ir provider on the `sms` channel alongside the
  // local provider for email/feed channels. The consumer keeps full control by
  // declaring their own `@medusajs/medusa/notification` module (e.g. to swap the
  // email provider for Resend), in which case this injection is skipped.
  const notificationModule = {
    resolve: "@medusajs/medusa/notification" as const,
    options: {
      providers: [
        {
          resolve: "@medusajs/medusa/notification-local",
          id: "local",
          options: {
            name: "Local Notification Provider",
            channels: ["email", "feed", "seller_feed", "vendor_feed"],
          },
        },
        {
          resolve: "@mercurjs/core/providers/notification-smsir",
          id: "smsir",
          options: {
            channels: ["sms"],
            apiKey: process.env.SMSIR_API_KEY,
            baseUrl: process.env.SMSIR_BASE_URL,
          },
        },
      ],
    },
  }

  const modules = [
    ...userModules,
    ...(hasModule("@medusajs/medusa/rbac")
      ? []
      : [{ resolve: "@medusajs/medusa/rbac" as const }]),
    ...(hasModule("@medusajs/medusa/notification") ? [] : [notificationModule]),
  ]

  const plugins = [
    ...(config.plugins ?? []),
    ...(!config.plugins?.some(
      (p) =>
        (typeof p === "string" ? p : p.resolve) === "@mercurjs/core"
    )
      ? [{ resolve: "@mercurjs/core", options: {} }]
      : []),
  ]

  // @ts-ignore
  return defineConfig({
    ...config,
    projectConfig,
    admin,
    featureFlags,
    modules,
    plugins,
  } as InputConfigWithArrayModules)
}
