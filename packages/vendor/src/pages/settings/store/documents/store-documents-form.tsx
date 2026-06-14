import { zodResolver } from "@hookform/resolvers/zod";
import { Button, toast } from "@medusajs/ui";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as zod from "zod";

import { FileType, FileUpload } from "@components/common/file-upload";
import { Form } from "@components/common/form";
import { RouteDrawer, useRouteModal } from "@components/modals";
import { KeyboundForm } from "@components/utilities/keybound-form";
import { uploadFilesQuery } from "@lib/client";
import { MediaSchema } from "@pages/products/create/constants";
import { HttpTypes } from "@mercurjs/types";
import { useUpdateSellerProfessionalDetails } from "@hooks/api";

const SUPPORTED_DOC_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

const StoreDocumentsSchema = zod.object({
  business_license: zod.array(MediaSchema).optional(),
  health_permit: zod.array(MediaSchema).optional(),
});

type StoreDocumentsFormProps = {
  seller: HttpTypes.StoreSellerResponse["seller"];
};

export const StoreDocumentsForm = ({ seller }: StoreDocumentsFormProps) => {
  const { t } = useTranslation();
  const { handleSuccess } = useRouteModal();
  const details = seller.professional_details as
    | { business_license?: string | null; health_permit?: string | null }
    | null
    | undefined;

  const form = useForm<zod.infer<typeof StoreDocumentsSchema>>({
    defaultValues: {
      business_license: details?.business_license
        ? [{ id: "existing-license", url: details.business_license, isThumbnail: false, file: null }]
        : [],
      health_permit: details?.health_permit
        ? [{ id: "existing-permit", url: details.health_permit, isThumbnail: false, file: null }]
        : [],
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

  const { mutateAsync, isPending } = useUpdateSellerProfessionalDetails(
    seller.id,
  );

  const uploadOne = async (
    files?: { file?: File | null; url?: string }[],
  ): Promise<string | null> => {
    const newFile = files?.find((m) => m.file);
    if (newFile) {
      const uploaded = await uploadFilesQuery([newFile]);
      return uploaded.files?.[0]?.url || null;
    }
    return files?.length ? files[0].url ?? null : null;
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    let businessLicense: string | null = null;
    let healthPermit: string | null = null;
    try {
      businessLicense = await uploadOne(values.business_license);
      healthPermit = await uploadOne(values.health_permit);
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      }
      return;
    }

    await mutateAsync(
      { business_license: businessLicense, health_permit: healthPermit },
      {
        onSuccess: () => {
          toast.success(t("store.documents.successToast"));
          handleSuccess();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  });

  const makeOnUploaded =
    (field: "business_license" | "health_permit") => (files: FileType[]) => {
      form.clearErrors(field);
      const invalid = files.find(
        (f) => !SUPPORTED_DOC_FORMATS.includes(f.file.type),
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
                      fileName={file?.file?.name}
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
                      fileName={file?.file?.name}
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
