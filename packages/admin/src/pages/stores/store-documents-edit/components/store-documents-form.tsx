import { zodResolver } from "@hookform/resolvers/zod";
import { Button, toast } from "@medusajs/ui";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as zod from "zod";

import { FileType, FileUpload } from "@components/common/file-upload";
import { Form } from "@components/common/form";
import { RouteDrawer, useRouteModal } from "@components/modals";
import { KeyboundForm } from "@components/utilities/keybound-form";
import { StoreDocumentsResponse, StoreDocumentType } from "@lib/client";
import {
  useDeleteSellerStoreDocument,
  useUploadSellerStoreDocuments,
} from "@hooks/api/store-documents";

import {
  planDocumentChanges,
  SUPPORTED_DOC_FORMATS,
  withKnownType,
} from "./plan-document-changes";

const DocumentSchema = zod
  .object({ url: zod.string(), file: zod.any().nullable() })
  .nullable();

const StoreDocumentsSchema = zod.object({
  business_license: DocumentSchema,
  health_permit: DocumentSchema,
});

type StoreDocumentsFormProps = {
  sellerId: string;
  documents?: StoreDocumentsResponse["store_documents"];
};

/**
 * DFACTORIES: an admin uploads a store's documents on its behalf, into the
 * host's PRIVATE bucket. This replaced a free-text URL field, which let any
 * public address be saved as a store's license.
 */
export const StoreDocumentsForm = ({
  sellerId,
  documents,
}: StoreDocumentsFormProps) => {
  const { t } = useTranslation();
  const { handleSuccess } = useRouteModal();

  const existing = (type: StoreDocumentType) => {
    const doc = documents?.[type];
    return doc ? { url: doc.url, file: null } : null;
  };

  const form = useForm<zod.infer<typeof StoreDocumentsSchema>>({
    defaultValues: {
      business_license: existing("business_license"),
      health_permit: existing("health_permit"),
    },
    resolver: zodResolver(StoreDocumentsSchema),
  });

  const values = useWatch({ control: form.control });

  const upload = useUploadSellerStoreDocuments(sellerId);
  const remove = useDeleteSellerStoreDocument(sellerId);

  const handleSubmit = form.handleSubmit(async (submitted) => {
    const { files, removed } = planDocumentChanges(submitted, documents);

    if (!Object.keys(files).length && !removed.length) {
      handleSuccess();
      return;
    }

    try {
      if (Object.keys(files).length) {
        await upload.mutateAsync(files);
      }
      // Each clears its own column, so they need not wait for each other.
      await Promise.all(removed.map((type) => remove.mutateAsync(type)));
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
      return;
    }

    toast.success(t("store.documents.successToast"));
    handleSuccess();
  });

  const makeOnUploaded =
    (field: StoreDocumentType) => (files: FileType[]) => {
      form.clearErrors(field);
      const [picked] = files;
      if (!picked || !SUPPORTED_DOC_FORMATS.includes(withKnownType(picked.file).type)) {
        form.setError(field, {
          type: "invalid_file",
          message: t("store.documents.invalidFileType"),
        });
        return;
      }
      form.setValue(field, { url: picked.url, file: picked.file }, {
        shouldDirty: true,
      });
    };

  const renderField = (type: StoreDocumentType, label: string) => (
    <Form.Field
      control={form.control}
      name={type}
      render={() => {
        const current = values[type];
        const file = current?.file as File | null | undefined;
        return (
          <Form.Item>
            <Form.Label optional>{label}</Form.Label>
            <Form.Control>
              <FileUpload
                uploadedImage={current?.url || null}
                fileName={file?.name ?? label}
                fileSize={file?.size}
                multiple={false}
                label={t("store.documents.uploadLabel")}
                hint={t("store.documents.uploadHint")}
                hasError={!!form.formState.errors[type]}
                formats={SUPPORTED_DOC_FORMATS}
                onUploaded={makeOnUploaded(type)}
                onRemove={() => form.setValue(type, null, { shouldDirty: true })}
              />
            </Form.Control>
            <Form.ErrorMessage />
          </Form.Item>
        );
      }}
    />
  );

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          {renderField("business_license", t("store.documents.businessLicense"))}
          {renderField("health_permit", t("store.documents.healthPermit"))}
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button variant="secondary" size="small">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button
              type="submit"
              size="small"
              isLoading={upload.isPending || remove.isPending}
            >
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  );
};
