import { PencilSquare } from "@medusajs/icons";
import { Container, Heading, Text } from "@medusajs/ui";
import { useTranslation } from "react-i18next";

import { ActionMenu } from "../../../../components/common/action-menu";
import { InferClientOutput } from "@mercurjs/client";
import { sdk, StoreDocumentType } from "@lib/client";
import { useSellerStoreDocuments } from "@hooks/api/store-documents";

type Seller = InferClientOutput<typeof sdk.admin.sellers.$id.query>["seller"];

type StoreDocumentsSectionProps = {
  seller: Seller;
};

/**
 * DFACTORIES: the documents are private. `professional_details` only holds an
 * object key, which says whether a document exists; the link is a short-lived
 * URL from `/admin/sellers/:id/store-documents`.
 */
export const StoreDocumentsSection = ({
  seller,
}: StoreDocumentsSectionProps) => {
  const { t } = useTranslation();
  const { store_documents } = useSellerStoreDocuments(seller.id);
  const details = seller.professional_details as
    | { business_license?: string | null; health_permit?: string | null }
    | null
    | undefined;

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
                  label: t("actions.edit"),
                  icon: <PencilSquare />,
                  to: `/stores/${seller.id}/documents`,
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
