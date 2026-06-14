import { PencilSquare } from "@medusajs/icons";
import { Container, Heading, Text } from "@medusajs/ui";
import { useTranslation } from "react-i18next";

import { ActionMenu } from "../../../../components/common/action-menu";
import { InferClientOutput } from "@mercurjs/client";
import { sdk } from "@lib/client";

type Seller = InferClientOutput<typeof sdk.admin.sellers.$id.query>["seller"];

type StoreDocumentsSectionProps = {
  seller: Seller;
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
                  label: t("actions.edit"),
                  icon: <PencilSquare />,
                  to: `/stores/${seller.id}/professional-details`,
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
