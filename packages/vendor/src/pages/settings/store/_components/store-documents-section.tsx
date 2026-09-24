import { PencilSquare } from "@medusajs/icons";
import { Container, Heading, Text } from "@medusajs/ui";
import { useTranslation } from "react-i18next";

import { ActionMenu } from "@components/common/action-menu";
import { useStoreDocuments } from "@hooks/api";
import { StoreDocumentType } from "@lib/client";
import { HttpTypes } from "@mercurjs/types";

type StoreDocumentsSectionProps = {
  seller: HttpTypes.StoreSellerResponse["seller"];
};

/**
 * DFACTORIES: the documents are private. `professional_details` only holds an
 * object key, which says whether a document exists; the link comes from
 * `/vendor/store-documents` as a short-lived URL. A seat without `seller:read`
 * gets no link but still sees whether each document was provided.
 */
export const StoreDocumentsSection = ({
  seller,
}: StoreDocumentsSectionProps) => {
  const { t } = useTranslation();
  const { store_documents } = useStoreDocuments();
  const details = seller.professional_details as
    | { business_license?: string | null; health_permit?: string | null }
    | null
    | undefined;
  const hasAny = !!details?.business_license || !!details?.health_permit;

  const renderRow = (label: string, type: StoreDocumentType) => {
    const doc = store_documents?.[type];
    return (
      <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
        <Text size="small" leading="compact" weight="plus">
          {label}
        </Text>
        {doc ? (
          <a
            href={doc.url}
            target="_blank"
            rel="noreferrer"
            className="text-ui-fg-interactive text-sm"
          >
            {t("store.documents.view")}
          </a>
        ) : details?.[type] ? (
          <Text size="small">{t("store.documents.provided")}</Text>
        ) : (
          <Text size="small" className="text-ui-fg-muted">
            {t("store.documents.notProvided")}
          </Text>
        )}
      </div>
    );
  };

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
      {renderRow(t("store.documents.businessLicense"), "business_license")}
      {renderRow(t("store.documents.healthPermit"), "health_permit")}
    </Container>
  );
};
