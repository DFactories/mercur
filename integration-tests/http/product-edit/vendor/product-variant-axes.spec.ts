import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createProductAttributesWorkflow,
  createProductsWorkflow,
} from "@mercurjs/core/workflows"
import { AttributeType } from "@mercurjs/types"

import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(90_000)

/**
 * A product imported with one variant (and so with the `__default__`
 * placeholder option) and given its variant axes afterwards. In production
 * (2026-10-05) every later save of that variant was refused by Medusa:
 * "Product has 5 option values but there were 4 provided", and a dictionary
 * `unit` attribute flagged as an axis made the form send an option the product
 * did not have ("Option value 300 does not exist for option حجم").
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor product variant axes", () => {
      let container: MedusaContainer
      let sellerHeaders: { headers: Record<string, string> }
      let sellerId: string

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        const res = await createSellerUser(container, {
          email: "axes-seller@test.com",
          name: "Axes Seller",
        })
        sellerHeaders = res.headers
        sellerId = sellerHeaders.headers["x-seller-id"]
      })

      const createSingleVariantProduct = async () => {
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: "Foil container",
                status: "draft",
                variants: [{ title: "Default" }],
              },
            ],
            created_by: sellerId,
          },
        })
        return (result as { id: string }[])[0].id
      }

      const batch = (productId: string, body: Record<string, unknown>) =>
        api.post(
          `/vendor/products/${productId}/attributes/batch`,
          body,
          sellerHeaders,
        )

      const variantsOf = async (productId: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "variant",
          fields: ["id", "options.value", "options.option.title"],
          filters: { product_id: productId },
        })
        return (data as {
          id: string
          options: { value: string; option: { title: string } }[]
        }[]).map((v) => ({
          id: v.id,
          options: Object.fromEntries(
            (v.options ?? []).map((o) => [o.option.title, o.value]),
          ),
        }))
      }

      const optionTitles = async (productId: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product_option",
          fields: ["id", "title", "products.id"],
          filters: {},
        })
        return (data as { title: string; products?: { id: string }[] }[])
          .filter((o) => (o.products ?? []).some((p) => p.id === productId))
          .map((o) => o.title)
          .sort()
      }

      const scopedAttribute = async (productId: string, name: string) => {
        const product = (
          await api.get(`/vendor/products/${productId}`, sellerHeaders)
        ).data.product
        return (product.attributes ?? []).find(
          (a: { name: string }) => a.name === name,
        )
      }

      it("drops the placeholder and gives the variant the axis value when the first axis is added", async () => {
        const productId = await createSingleVariantProduct()
        const [before] = await variantsOf(productId)
        expect(before.options).toEqual({ __default__: "__default__" })

        const res = await batch(productId, {
          add: [
            { title: "حجم", values: ["300 سی سی"], is_variant_axis: true },
          ],
        })

        expect(res.status).toBe(202)
        expect(await optionTitles(productId)).toEqual(["حجم"])
        const [after] = await variantsOf(productId)
        expect(after.id).toBe(before.id)
        expect(after.options).toEqual({ حجم: "300 سی سی" })
      })

      it("saves the variant once several axes were added one by one", async () => {
        const productId = await createSingleVariantProduct()
        for (const [title, value] of [
          ["ضخامت", "50 میکرون"],
          ["وزن", "4 گرم"],
          ["تعداد در کارتن", "1500 عددی"],
          ["حجم", "300 سی سی"],
        ]) {
          const res = await batch(productId, {
            add: [{ title, values: [value], is_variant_axis: true }],
          })
          expect(res.status).toBe(202)
        }

        const [variant] = await variantsOf(productId)
        expect(variant.options).toEqual({
          ضخامت: "50 میکرون",
          وزن: "4 گرم",
          "تعداد در کارتن": "1500 عددی",
          حجم: "300 سی سی",
        })

        const res = await api.post(
          `/vendor/products/${productId}/variants/${variant.id}`,
          {
            title: "Renamed",
            options: {
              ضخامت: "50 میکرون",
              وزن: "4 گرم",
              "تعداد در کارتن": "1500 عددی",
              حجم: "300 سی سی",
            },
          },
          sellerHeaders,
        )

        expect(res.status).toBe(202)
      })

      it("lets the variant use a value added to its axis afterwards", async () => {
        const productId = await createSingleVariantProduct()
        await batch(productId, {
          add: [
            { title: "حجم", values: ["300 سی سی"], is_variant_axis: true },
          ],
        })
        const axis = await scopedAttribute(productId, "حجم")

        const added = await batch(productId, {
          update: [{ id: axis.id, add: [{ value: "500 سی سی" }] }],
        })
        expect(added.status).toBe(202)

        const [variant] = await variantsOf(productId)
        const res = await api.post(
          `/vendor/products/${productId}/variants/${variant.id}`,
          { options: { حجم: "500 سی سی" } },
          sellerHeaders,
        )

        expect(res.status).toBe(202)
        const [after] = await variantsOf(productId)
        expect(after.options).toEqual({ حجم: "500 سی سی" })
      })

      it("refuses a value the axis does not have with a translatable key", async () => {
        const productId = await createSingleVariantProduct()
        await batch(productId, {
          add: [
            { title: "حجم", values: ["300 سی سی"], is_variant_axis: true },
          ],
        })
        const [variant] = await variantsOf(productId)

        const res = await api
          .post(
            `/vendor/products/${productId}/variants/${variant.id}`,
            { options: { حجم: "300" } },
            sellerHeaders,
          )
          .catch((e) => e.response)

        expect(res.status).toBe(400)
        expect(res.data.message).toBe("apiErrors.product.optionValueMissing")
      })

      it("removes an axis every variant shares, and restores the placeholder when it was the last", async () => {
        const productId = await createSingleVariantProduct()
        await batch(productId, {
          add: [
            { title: "حجم", values: ["300 سی سی"], is_variant_axis: true },
          ],
        })
        await batch(productId, {
          add: [{ title: "وزن", values: ["4 گرم"], is_variant_axis: true }],
        })

        const weight = await scopedAttribute(productId, "وزن")
        const removed = await batch(productId, { remove: [weight.id] })
        expect(removed.status).toBe(202)
        expect(await optionTitles(productId)).toEqual(["حجم"])
        expect((await variantsOf(productId))[0].options).toEqual({
          حجم: "300 سی سی",
        })

        const volume = await scopedAttribute(productId, "حجم")
        const last = await batch(productId, { remove: [volume.id] })
        expect(last.status).toBe(202)
        expect(await optionTitles(productId)).toEqual(["__default__"])
        expect((await variantsOf(productId))[0].options).toEqual({
          __default__: "__default__",
        })
      })

      it("refuses to remove an axis the variants differ on", async () => {
        const productId = await createSingleVariantProduct()
        await batch(productId, {
          add: [
            {
              title: "حجم",
              values: ["300 سی سی", "500 سی سی"],
              is_variant_axis: true,
            },
          ],
        })
        const created = await api.post(
          `/vendor/products/${productId}/variants`,
          { title: "Large", options: { حجم: "500 سی سی" } },
          sellerHeaders,
        )
        expect(created.status).toBe(202)
        expect(await variantsOf(productId)).toHaveLength(2)

        const volume = await scopedAttribute(productId, "حجم")
        const res = await batch(productId, { remove: [volume.id] }).catch(
          (e) => e.response,
        )

        expect(res.status).toBe(400)
        expect(res.data.message).toBe("apiErrors.product.axisInUse")
      })

      it("does not report a dictionary unit attribute as a variant axis", async () => {
        const { result } = await createProductAttributesWorkflow(
          container,
        ).run({
          input: {
            attributes: [
              {
                name: "ظرفیت",
                type: AttributeType.UNIT,
                is_variant_axis: true,
              },
            ],
          },
        })
        const productId = await createSingleVariantProduct()
        const linked = await batch(productId, {
          add: [{ id: result[0].id, value: "300" }],
        })
        expect(linked.status).toBe(202)

        const capacity = await scopedAttribute(productId, "ظرفیت")
        expect(capacity).toBeTruthy()
        expect(capacity.is_variant_axis).toBe(false)
      })
    })
  },
})
