import { Heading } from "@medusajs/ui";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";

import { RouteDrawer } from "../../../components/modals";
import { useSeller } from "../../../hooks/api/sellers";
import { StoreDocumentsForm } from "./components/store-documents-form";

export const StoreDocumentsEdit = () => {
  const { id } = useParams();
  const { t } = useTranslation();

  const { seller, isLoading, isError, error } = useSeller(id!);

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
          {t("store.documents.adminUrlHint")}
        </RouteDrawer.Description>
      </RouteDrawer.Header>
      {!isLoading && seller && <StoreDocumentsForm seller={seller} />}
    </RouteDrawer>
  );
};
