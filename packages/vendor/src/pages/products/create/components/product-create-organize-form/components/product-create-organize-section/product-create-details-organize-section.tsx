import { Button, Heading } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Form } from "@components/common/form"
import { SwitchBox } from "@components/common/switch-box"
import { Combobox } from "@components/inputs/combobox"
import { HandleInput } from "@components/inputs/handle-input"
import { useTabbedForm } from "@components/tabbed-form/tabbed-form"
import { useComboboxData } from "@hooks/use-combobox-data"
import { fetchQuery, sdk } from "@lib/client"

import { SingleCategoryCombobox } from "../../../../../common/components/category-combobox"
import { ProductCreateSchemaType } from "../../../../types"
import { applyHandleSuggestion, restoreHandleSuggestion } from "./handle-suggestion"

const fetchHandleSuggestion = async (title: string, category_id: string) =>
  (
    (await fetchQuery("/vendor/product-handle-suggestion", {
      method: "GET",
      query: { title, category_id },
    })) as { handle?: unknown }
  ).handle

export const ProductCreateOrganizationSection = () => {
  const form = useTabbedForm<ProductCreateSchemaType>()
  const { t } = useTranslation()

  const collections = useComboboxData({
    queryKey: ["product_collections"],
    queryFn: (params: any) => sdk.vendor.collections.query(params) as any,
    getOptions: (data: any) =>
      data.collections.map((collection: { id: string; title: string }) => ({
        label: collection.title,
        value: collection.id,
      })),
  })

  const types = useComboboxData({
    queryKey: ["product_types"],
    queryFn: (params: any) => sdk.vendor.productTypes.query(params) as any,
    getOptions: (data: any) =>
      data.product_types.map((type: { id: string; value: string }) => ({
        label: type.value,
        value: type.id,
      })),
  })

  const tags = useComboboxData({
    queryKey: ["product_tags"],
    queryFn: (params: any) => sdk.vendor.productTags.query(params) as any,
    getOptions: (data: any) =>
      data.product_tags.map((tag: { id: string; value: string }) => ({
        label: tag.value,
        value: tag.id,
      })),
  })

  // The handle is suggested from the category and the title, so it sits under
  // the category; the title was entered on the previous tab.
  const categoryId = form.watch("category_id")
  const handle = form.watch("handle")
  const [suggestion, setSuggestion] = useState<string>()

  useEffect(() => {
    let current = true
    void applyHandleSuggestion(form, fetchHandleSuggestion, () => current).then(
      (next) => {
        if (current && next) setSuggestion(next)
      }
    )
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId])

  return (
    <div id="organize" className="flex flex-col gap-y-8" data-testid="product-create-organize-section">
      <Heading data-testid="product-create-organize-section-heading">{t("products.organization.header")}</Heading>
      <SwitchBox
        control={form.control}
        name="discountable"
        label={t("products.fields.discountable.label")}
        description={t("products.fields.discountable.hint")}
        optional
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="product-create-organize-section-category-collection">
        <Form.Field
          control={form.control}
          name="category_id"
          render={({ field }) => {
            return (
              <Form.Item data-testid="product-create-organize-section-category-item">
                <Form.Label
                  tooltip={t("products.fields.primaryCategory.tooltip")}
                  data-testid="product-create-organize-section-category-label"
                >
                  {t("fields.category")}
                </Form.Label>
                <Form.Control data-testid="product-create-organize-section-category-control">
                  <SingleCategoryCombobox {...field} />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )
          }}
        />
        <Form.Field
          control={form.control}
          name="collection_id"
          render={({ field }) => {
            return (
              <Form.Item data-testid="product-create-organize-section-collection-item">
                <Form.Label optional data-testid="product-create-organize-section-collection-label">
                  {t("products.fields.collection.label")}
                </Form.Label>
                <Form.Control data-testid="product-create-organize-section-collection-control">
                  <Combobox
                    {...field}
                    options={collections.options}
                    searchValue={collections.searchValue}
                    onSearchValueChange={collections.onSearchValueChange}
                    fetchNextPage={collections.fetchNextPage}
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )
          }}
        />
      </div>
      <Form.Field
        control={form.control}
        name="handle"
        render={({ field }) => {
          return (
            <Form.Item data-testid="product-create-organize-section-handle-item">
              <Form.Label
                tooltip={t("products.fields.handle.tooltip")}
                optional
                data-testid="product-create-organize-section-handle-label"
              >
                {t("products.fields.handle.label")}
              </Form.Label>
              {/* LTR box AROUND the control: the Slot puts id/aria-* on its first child. */}
              <div dir="ltr">
                <Form.Control data-testid="product-create-organize-section-handle-control">
                  <HandleInput
                    {...field}
                    placeholder={t("products.fields.handle.placeholder")}
                    data-testid="product-create-organize-section-handle-input"
                  />
                </Form.Control>
              </div>
              <Form.Hint>{t("products.fields.handle.hint")}</Form.Hint>
              {suggestion && handle !== suggestion && (
                <div>
                  <Button
                    type="button"
                    variant="transparent"
                    size="small"
                    onClick={() => restoreHandleSuggestion(form, suggestion)}
                    data-testid="product-create-organize-section-handle-use-suggestion"
                  >
                    {t("products.fields.handle.useSuggestion")}
                  </Button>
                </div>
              )}
              <Form.ErrorMessage />
            </Form.Item>
          )
        }}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="product-create-organize-section-type-tags">
        <Form.Field
          control={form.control}
          name="type_id"
          render={({ field }) => {
            return (
              <Form.Item data-testid="product-create-organize-section-type-item">
                <Form.Label optional data-testid="product-create-organize-section-type-label">
                  {t("products.fields.type.label")}
                </Form.Label>
                <Form.Control data-testid="product-create-organize-section-type-control">
                  <Combobox
                    {...field}
                    options={types.options}
                    searchValue={types.searchValue}
                    onSearchValueChange={types.onSearchValueChange}
                    fetchNextPage={types.fetchNextPage}
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )
          }}
        />
        <Form.Field
          control={form.control}
          name="tags"
          render={({ field }) => {
            return (
              <Form.Item data-testid="product-create-organize-section-tags-item">
                <Form.Label optional data-testid="product-create-organize-section-tags-label">
                  {t("products.fields.tags.label")}
                </Form.Label>
                <Form.Control data-testid="product-create-organize-section-tags-control">
                  <Combobox
                    {...field}
                    options={tags.options}
                    searchValue={tags.searchValue}
                    onSearchValueChange={tags.onSearchValueChange}
                    fetchNextPage={tags.fetchNextPage}
                  />
                </Form.Control>
                <Form.ErrorMessage />
              </Form.Item>
            )
          }}
        />
      </div>
    </div>
  )
}
