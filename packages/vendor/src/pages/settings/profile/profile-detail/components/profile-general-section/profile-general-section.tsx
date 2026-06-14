import { PencilSquare } from "@medusajs/icons"
import { Avatar, Container, Heading, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { ActionMenu } from "../../../../../../components/common/action-menu"
import { useMe } from "../../../../../../hooks/api"
import { languages } from "../../../../../../i18n/languages"

export const ProfileGeneralSection = () => {
  const { i18n, t } = useTranslation()
  const { seller_member } = useMe()
  const member = seller_member?.member

  const fullName = [member?.first_name, member?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  const fallback = (fullName || member?.email || "U").charAt(0).toUpperCase()

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-x-3">
          <Avatar
            size="large"
            src={member?.photo ?? undefined}
            fallback={fallback}
          />
          <div>
            <Heading>{t("profile.domain")}</Heading>
            <Text className="text-ui-fg-subtle" size="small">
              {t("profile.manageYourProfileDetails")}
            </Text>
          </div>
        </div>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: t("actions.edit"),
                  to: "edit",
                  icon: <PencilSquare />,
                },
              ],
            },
          ]}
        />
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.firstName", "First name")}
        </Text>
        <Text size="small" leading="compact">
          {member?.first_name || "-"}
        </Text>
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.lastName", "Last name")}
        </Text>
        <Text size="small" leading="compact">
          {member?.last_name || "-"}
        </Text>
      </div>
      <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {t("profile.fields.languageLabel")}
        </Text>
        <Text size="small" leading="compact">
          {languages.find((lang) => lang.code === i18n.language)
            ?.display_name || "-"}
        </Text>
      </div>
    </Container>
  )
}
