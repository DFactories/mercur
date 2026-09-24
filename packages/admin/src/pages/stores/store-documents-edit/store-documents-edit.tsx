import { Heading } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { RouteDrawer } from "../../../components/modals";
import { useSellerStoreDocuments } from "../../../hooks/api/store-documents";
import { StoreDocumentsForm } from "./components/store-documents-form";

export const StoreDocumentsEdit = () => {
  const { id } = useParams();
  const { t } = useTranslation();

  // The current documents are the form's defaults: mounting before they load
  // would treat an existing document as removed.
  const { store_documents, isPending, isError, error } =
    useSellerStoreDocuments(id!);

  if (isError) {
    throw error;
  }

  return (
    <RouteDrawer>
      <RouteDrawer.Header>
        <RouteDrawer.Title asChild>
          <Heading>{t("store.documents.header")}</Heading>
        </RouteDrawer.Title>
        <RouteDrawer.Description className="sr-only">
          {t("store.documents.editDescription")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      {!isPending && (
        <StoreDocumentsForm sellerId={id!} documents={store_documents} />
      )}
    </RouteDrawer>
  );
};
