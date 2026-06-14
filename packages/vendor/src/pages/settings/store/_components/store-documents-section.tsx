import { PencilSquare } from "@medusajs/icons";
import { Container, Heading, Text } from "@medusajs/ui";
import { useTranslation } from "react-i18next";

import { ActionMenu } from "@components/common/action-menu";
import { HttpTypes } from "@mercurjs/types";

type StoreDocumentsSectionProps = {
  seller: HttpTypes.StoreSellerResponse["seller"];
};

export const StoreDocumentsSection = ({
  seller,
}: StoreDocumentsSectionProps) => {
  const { t } = useTranslation();
  const details = seller.professional_details as
    | { business_license?: string | null; health_permit?: string | null }
    | null
    | undefined;
  const license = details?.business_license;
  const permit = details?.health_permit;
  const hasAny = !!license || !!permit;

  const renderRow = (label: string, url?: string | null) => (
    <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
      <Text size="small" leading="compact" weight="plus">
        {label}
      </Text>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-ui-fg-interactive text-sm"
        >
          {t("store.documents.view")}
        </a>
      ) : (
        <Text size="small" className="text-ui-fg-muted">
          {t("store.documents.notProvided")}
        </Text>
      )}
    </div>
  );

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">{t("store.documents.header")}</Heading>
        <ActionMenu
          groups={[
            {
              actions: [
                {
                  label: hasAny
                    ? t("actions.edit")
                    : t("store.documents.upload"),
                  icon: <PencilSquare />,
                  to: "documents",
                },
              ],
            },
          ]}
        />
      </div>
      {renderRow(t("store.documents.businessLicense"), license)}
      {renderRow(t("store.documents.healthPermit"), permit)}
    </Container>
  );
};
