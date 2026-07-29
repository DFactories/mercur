import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

import {
  createProductAttributesWorkflow,
} from "@mercurjs/core/workflows"

jest.setTimeout(60000)

/**
 * Store product-attribute catalog: `category_id` narrowing.
 *
 * A storefront filter rail is per-category, so it must be able to ask which
 * attributes apply to the category it is rendering. The vendor route has always
 * supported this; the store route did not, and without it a rail can only show
 * vertical-agnostic filters.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    let appContainer: MedusaContainer
    let headers: Record<string, string>
    let containersCategoryId: string
    let labelsCategoryId: string

    beforeAll(async () => {
      appContainer = getContainer()

      const productModule = appContainer.resolve(Modules.PRODUCT)
      const [containers, labels] = await productModule.createProductCategories([
        { name: "Containers", handle: "containers", is_active: true },
        { name: "Labels", handle: "labels", is_active: true },
      ])
      containersCategoryId = containers.id
      labelsCategoryId = labels.id

      await createProductAttributesWorkflow(appContainer).run({
        input: {
          attributes: [
            {
              name: "Polymer",
              handle: "polymer",
              type: "single_select",
              is_active: true,
              category_ids: [containersCategoryId],
            },
            {
              name: "Material",
              handle: "material",
              type: "single_select",
              is_active: true,
            },
          ],
        },
      })

      const apiKeyModule = appContainer.resolve(Modules.API_KEY)
      const key = await apiKeyModule.createApiKeys({
        title: "store product-attribute test",
        type: "publishable",
        created_by: "test",
      })
      headers = { "x-publishable-api-key": key.token }
    })

    it("returns the whole catalog when no category is given", async () => {
      const response = await api.get("/store/product-attributes", { headers })

      expect(response.status).toEqual(200)
      const handles = response.data.product_attributes.map(
        (a: { handle: string }) => a.handle
      )
      expect(handles).toEqual(expect.arrayContaining(["polymer", "material"]))
    })

    it("returns the category's attributes plus global ones", async () => {
      const response = await api.get(
        `/store/product-attributes?category_id=${containersCategoryId}`,
        { headers }
      )

      expect(response.status).toEqual(200)
      const handles = response.data.product_attributes.map(
        (a: { handle: string }) => a.handle
      )
      expect(handles).toEqual(expect.arrayContaining(["polymer", "material"]))
    })

    it("omits an attribute scoped to a different category", async () => {
      const response = await api.get(
        `/store/product-attributes?category_id=${labelsCategoryId}`,
        { headers }
      )

      expect(response.status).toEqual(200)
      const handles = response.data.product_attributes.map(
        (a: { handle: string }) => a.handle
      )
      // Global stays, category-scoped one drops out.
      expect(handles).toContain("material")
      expect(handles).not.toContain("polymer")
    })
  },
})
