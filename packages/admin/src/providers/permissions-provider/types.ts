/** The two checks a consumer of `usePermissions` actually calls. */
export type PermissionChecks = {
  hasPermission: (permission: string) => boolean
  hasAnyPermission: (permissions: string[]) => boolean
}
