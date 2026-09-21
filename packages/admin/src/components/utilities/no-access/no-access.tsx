import { LockClosedSolid } from "@medusajs/icons"
import { Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

/**
 * What a restricted operator sees instead of a screen they may not open.
 *
 * Deliberately not `ErrorBoundary`: a refusal is not a fault, and "An
 * unexpected error occurred while rendering this page" is what this replaces.
 */
export const NoAccess = ({ permission }: { permission?: string | null }) => {
  const { t } = useTranslation()

  return (
    <div
      className="flex size-full min-h-[calc(100vh-57px-24px)] items-center justify-center"
      data-testid="no-access"
    >
      <div className="text-ui-fg-subtle flex flex-col items-center gap-y-3">
        <LockClosedSolid />
        <div className="flex flex-col items-center justify-center gap-y-1">
          <Text size="small" leading="compact" weight="plus">
            {t("noAccess.title")}
          </Text>
          <Text
            size="small"
            className="text-ui-fg-muted text-balance text-center"
          >
            {t("noAccess.message")}
          </Text>
          {permission ? (
            <Text
              size="xsmall"
              className="text-ui-fg-muted mt-2"
              dir="ltr"
              data-testid="no-access-permission"
            >
              {permission}
            </Text>
          ) : null}
        </div>
      </div>
    </div>
  )
}
