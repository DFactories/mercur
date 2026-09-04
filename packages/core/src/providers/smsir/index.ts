/**
 * Entry point for the sms.ir transport.
 *
 * The client is exported from here so consumers reach it as
 * `@mercurjs/core/providers/smsir` — the package's `./providers/*` export maps
 * to `<dir>/index.js`, so a deep path to `client` does not resolve.
 */
export * from "./client"
