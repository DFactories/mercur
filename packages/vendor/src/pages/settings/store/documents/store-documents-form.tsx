import { zodResolver } from "@hookform/resolvers/zod";
import { Button, toast } from "@medusajs/ui";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as zod from "zod";

import { FileType, FileUpload } from "@components/common/file-upload";
import { Form } from "@components/common/form";
import { RouteDrawer, useRouteModal } from "@components/modals";
import { KeyboundForm } from "@components/utilities/keybound-form";
import {
  StoreDocumentsResponse,
  StoreDocumentType,
} from "@lib/client";
import { MediaSchema } from "@pages/products/create/constants";
import { useDeleteStoreDocument, useUploadStoreDocuments } from "@hooks/api";

import {
  planDocumentChanges,
  SUPPORTED_DOC_FORMATS,
  withKnownType,
} from "./plan-document-changes";

const StoreDocumentsSchema = zod.object({
  business_license: zod.array(MediaSchema).optional(),
  health_permit: zod.array(MediaSchema).optional(),
});

type StoreDocumentsFormProps = {
  /** Undefined when the member may not read them (no `seller:read`). */
  documents?: StoreDocumentsResponse["store_documents"];
};

/**
 * DFACTORIES: uploads go to the host's PRIVATE `/vendor/store-documents`,
 * which writes the seller record itself — never through `/vendor/uploads`,
 * which stores publicly.
 */
export const StoreDocumentsForm = ({ documents }: StoreDocumentsFormProps) => {
  const { t } = useTranslation();
  const { handleSuccess } = useRouteModal();

  const existing = (type: StoreDocumentType) => {
    const doc = documents?.[type];
    return doc
      ? [{ id: `existing-${type}`, url: doc.url, isThumbnail: false, file: null }]
      : [];
  };

  const form = useForm<zod.infer<typeof StoreDocumentsSchema>>({
    defaultValues: {
      business_license: existing("business_license"),
      health_permit: existing("health_permit"),
    },
    resolver: zodResolver(StoreDocumentsSchema),
  });

  const { fields: licenseFields } = useFieldArray({
    name: "business_license",
    control: form.control,
    keyName: "field_id",
  });
  const { fields: permitFields } = useFieldArray({
    name: "health_permit",
    control: form.control,
    keyName: "field_id",
  });

  const upload = useUploadStoreDocuments();
  const remove = useDeleteStoreDocument();

  const handleSubmit = form.handleSubmit(async (values) => {
    const { files, removed } = planDocumentChanges(
      {
        business_license: values.business_license?.[0],
        health_permit: values.health_permit?.[0],
      },
      documents,
    );

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
      const invalid = files.find(
        (f) => !SUPPORTED_DOC_FORMATS.includes(withKnownType(f.file).type),
      );
      if (invalid) {
        form.setError(field, {
          type: "invalid_file",
          message: t("store.documents.invalidFileType"),
        });
        return;
      }
      form.setValue(field, [{ ...files[0], isThumbnail: false }]);
    };

  const isPending = upload.isPending || remove.isPending;

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <RouteDrawer.Body className="flex flex-col gap-y-6 overflow-y-auto">
          <Form.Field
            name="business_license"
            control={form.control}
            render={() => {
              const file = licenseFields[0];
              return (
                <Form.Item>
                  <Form.Label optional>
                    {t("store.documents.businessLicense")}
                  </Form.Label>
                  <Form.Control>
                    <FileUpload
                      uploadedImage={file?.url || null}
                      fileName={
                        file?.file?.name ?? t("store.documents.businessLicense")
                      }
                      fileSize={file?.file?.size}
                      multiple={false}
                      label={t("products.media.uploadImagesLabel")}
                      hint={t("store.documents.uploadHint")}
                      hasError={!!form.formState.errors.business_license}
                      formats={SUPPORTED_DOC_FORMATS}
                      onUploaded={makeOnUploaded("business_license")}
                      onRemove={() => form.setValue("business_license", [])}
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              );
            }}
          />
          <Form.Field
            name="health_permit"
            control={form.control}
            render={() => {
              const file = permitFields[0];
              return (
                <Form.Item>
                  <Form.Label optional>
                    {t("store.documents.healthPermit")}
                  </Form.Label>
                  <Form.Control>
                    <FileUpload
                      uploadedImage={file?.url || null}
                      fileName={
                        file?.file?.name ?? t("store.documents.healthPermit")
                      }
                      fileSize={file?.file?.size}
                      multiple={false}
                      label={t("products.media.uploadImagesLabel")}
                      hint={t("store.documents.uploadHint")}
                      hasError={!!form.formState.errors.health_permit}
                      formats={SUPPORTED_DOC_FORMATS}
                      onUploaded={makeOnUploaded("health_permit")}
                      onRemove={() => form.setValue("health_permit", [])}
                    />
                  </Form.Control>
                  <Form.ErrorMessage />
                </Form.Item>
              );
            }}
          />
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteDrawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteDrawer.Close>
            <Button size="small" type="submit" isLoading={isPending}>
              {t("actions.save")}
            </Button>
          </div>
        </RouteDrawer.Footer>
      </KeyboundForm>
    </RouteDrawer.Form>
  );
};
