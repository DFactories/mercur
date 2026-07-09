import { Button, Input, Select, toast } from "@medusajs/ui"
import { useCallback } from "react"
import { useFieldArray } from "react-hook-form"
import { useTranslation } from "react-i18next"
import * as zod from "zod"

import {
  FormExtensionZone,
  useExtendableForm,
  useExtension,
} from "@mercurjs/dashboard-shared"

import { FileType, FileUpload } from "@components/common/file-upload"
import { Form } from "../../../../../../components/common/form"
import { RouteDrawer, useRouteModal } from "../../../../../../components/modals"
import { KeyboundForm } from "../../../../../../components/utilities/keybound-form"
import { languages } from "../../../../../../i18n/languages"
import { useDocumentDirection } from "../../../../../../hooks/use-document-direction"
import { useMe, useUpdateMe } from "../../../../../../hooks/api"
import { uploadFilesQuery } from "@lib/client"
import { MediaSchema } from "@pages/products/create/constants"

const SUPPORTED_IMAGE_FORMATS = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/svg+xml",
]

const EditProfileSchema = zod.object({
  first_name: zod.string().optional().or(zod.literal("")),
  last_name: zod.string().optional().or(zod.literal("")),
  photo: zod.array(MediaSchema).optional(),
  language: zod.string(),
})

export const EditProfileForm = () => {
  const { t, i18n } = useTranslation()
  const { handleSuccess } = useRouteModal()
  const direction = useDocumentDirection()

  const memberLinks = useExtension().getLinks("member")
  const meQuery = memberLinks.length
    ? { fields: memberLinks.map((link) => `+member.${link}.*`).join(",") }
    : undefined

  const { seller_member } = useMe(meQuery)
  const member = seller_member?.member

  const form = useExtendableForm({
    schema: EditProfileSchema,
    model: "member",
    zone: "edit",
    data: member,
    defaultValues: {
      first_name: member?.first_name ?? "",
      last_name: member?.last_name ?? "",
      photo: member?.photo
        ? [{ id: "existing-photo", url: member.photo, isThumbnail: false, file: null }]
        : [],
      language: i18n.language,
    },
  })

  const { fields: photoFields } = useFieldArray({
    name: "photo",
    control: form.control,
    keyName: "field_id",
  })

  const sortedLanguages = languages.sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  )

  const { mutateAsync: updateMe, isPending } = useUpdateMe()

  const onPhotoUploaded = useCallback(
    (files: FileType[]) => {
      form.clearErrors("photo")
      const invalid = files.find(
        (f) => !SUPPORTED_IMAGE_FORMATS.includes(f.file.type)
      )
      if (invalid) {
        form.setError("photo", {
          type: "invalid_file",
          message: t("products.media.invalidFileType", {
            name: invalid.file.name,
            types: SUPPORTED_IMAGE_FORMATS.join(", "),
          }),
        })
        return
      }
      form.setValue("photo", [{ ...files[0], isThumbnail: false }])
    },
    [form, t]
  )

  const handleSubmit = form.handleSubmit(async (values) => {
    let photoUrl: string | null = null
    const newPhotoFile = values.photo?.find((m) => m.file)
    try {
      if (newPhotoFile) {
        const uploaded = await uploadFilesQuery([newPhotoFile])
        photoUrl = uploaded.files?.[0]?.url || null
      } else if (values.photo?.length) {
        photoUrl = values.photo[0].url
      }
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message)
      }
      return
    }

    await updateMe(
      {
        first_name: values.first_name || null,
        last_name: values.last_name || null,
        photo: photoUrl,
        additional_data: values.additional_data,
      },
      {
        onSuccess: async () => {
          await i18n.changeLanguage(values.language)
          toast.success(t("profile.toast.edit"))
          handleSuccess()
        },
        onError: (error) => {
          toast.error(error.message)
        },
      },
    )
  })

  return (
    <RouteDrawer.Form form={form}>
      <KeyboundForm onSubmit={handleSubmit} className="flex flex-1 flex-col">
        <RouteDrawer.Body>
          <div className="flex flex-col gap-y-8">
            <div className="grid grid-cols-2 gap-x-3">
              <Form.Field
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label optional>
                      {t("profile.fields.firstName", "First name")}
                    </Form.Label>
                    <Form.Control>
                      <Input autoComplete="given-name" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
              <Form.Field
                control={form.control}
                name="last_name"
                render={({ field }) => (
                  <Form.Item>
                    <Form.Label optional>
                      {t("profile.fields.lastName", "Last name")}
                    </Form.Label>
                    <Form.Control>
                      <Input autoComplete="family-name" {...field} />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )}
              />
            </div>
            <Form.Field
              name="photo"
              control={form.control}
              render={() => {
                const photoFile = photoFields[0]
                const previewUrl = photoFile?.url || null
                return (
                  <Form.Item>
                    <Form.Label optional>
                      {t("profile.fields.photo", "Photo")}
                    </Form.Label>
                    <Form.Control>
                      <FileUpload
                        uploadedImage={previewUrl}
                        fileName={photoFile?.file?.name}
                        fileSize={photoFile?.file?.size}
                        multiple={false}
                        label={t("products.media.uploadImagesLabel")}
                        hint={t("products.media.uploadImagesHint")}
                        hasError={!!form.formState.errors.photo}
                        formats={SUPPORTED_IMAGE_FORMATS}
                        onUploaded={onPhotoUploaded}
                        onRemove={() => form.setValue("photo", [])}
                      />
                    </Form.Control>
                    <Form.ErrorMessage />
                  </Form.Item>
                )
              }}
            />
            <Form.Field
              control={form.control}
              name="language"
              render={({ field: { ref, ...field } }) => (
                <Form.Item className="gap-y-4">
                  <div>
                    <Form.Label>{t("profile.fields.languageLabel")}</Form.Label>
                    <Form.Hint>{t("profile.edit.languageHint")}</Form.Hint>
                  </div>
                  <div>
                    <Form.Control>
                      <Select
                        dir={direction}
                        {...field}
                        onValueChange={field.onChange}
                      >
                        <Select.Trigger ref={ref} className="py-1 text-[13px]">
                          <Select.Value
                            placeholder={t("profile.edit.languagePlaceholder")}
                          >
                            {
                              sortedLanguages.find(
                                (language) => language.code === field.value
                              )?.display_name
                            }
                          </Select.Value>
                        </Select.Trigger>
                        <Select.Content>
                          {sortedLanguages.map((language) => (
                            <Select.Item
                              key={language.code}
                              value={language.code}
                            >
                              {language.display_name}
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select>
                    </Form.Control>
                    <Form.ErrorMessage />
                  </div>
                </Form.Item>
              )}
            />
            <FormExtensionZone
              model="member"
              zone="edit"
              control={form.control}
              data={member}
            />
          </div>
        </RouteDrawer.Body>
        <RouteDrawer.Footer>
          <div className="flex items-center gap-x-2">
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
  )
}
