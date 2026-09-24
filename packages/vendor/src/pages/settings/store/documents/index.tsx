import { Heading } from "@medusajs/ui";
import { useTranslation } from "react-i18next";

import { RouteDrawer } from "@components/modals";
import { useStoreDocuments } from "@hooks/api";

import { StoreDocumentsForm } from "./store-documents-form";

export const Component = () => {
  const { t } = useTranslation();
  // Wait for the current documents: they are the form's defaults, and a form
  // mounted before them would treat an existing document as removed.
  const { store_documents, isPending } = useStoreDocuments();

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("store.documents.edit.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("store.documents.edit.description")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      {!isPending && <StoreDocumentsForm documents={store_documents} />}
    </RouteDrawer>
  );
};
