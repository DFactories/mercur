import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createProductAttributesWorkflow } from "@mercurjs/core/workflows"
import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * REGRESSION — an attribute scoped to a category reaches its subcategories.
 *
 * The attribute dictionary scopes «نوع پلیمر», «حجم», «نوع درب», «کاربرد دمایی»
 * and «شکل» to TOP-LEVEL categories and links them on exactly those nodes. The
 * vendor product form asks for the attributes of the product's own category —
 * a leaf such as «جعبه غذا» — and `filterAttributesByCategoryLinkOrGlobal`
 * matched links exactly, so a seller filing a meal box was never offered any
 * of them and the facets built on them stayed empty for nearly every product.
 *
 * The rule now: requesting a category returns attributes linked to it OR to
 * any of its ancestors, plus the global ones. Admin, vendor and store share
 * the middleware; both the seller's form and the storefront rail are pinned.
 */

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Product attributes of a subcategory include its ancestors' scope", () => {
      let appContainer: MedusaContainer
      let vendorHeaders: { headers: Record<string, string> }
      let storeHeaders: { headers: Record<string, string> }
      let foodContainersId: string
      let mealBoxesId: string
      let labelsId: string

      beforeEach(async () => {
        appContainer = getContainer()
        await createAdminUser(dbConnection, adminHeaders, appContainer)

        const { seller, headers } = await createSellerUser(appContainer, {
          email: "attr-scope@test.com",
          name: "Attribute Scope Store",
        })
        await api.post(
          `/admin/sellers/${(seller as { id: string }).id}/approve`,
          {},
          adminHeaders
        )
        vendorHeaders = headers

        const productModule = appContainer.resolve(Modules.PRODUCT)
        const [foodContainers, labels] =
          await productModule.createProductCategories([
            { name: "ظروف غذا", handle: "food-containers", is_active: true },
            { name: "برچسب", handle: "labels", is_active: true },
          ])
        const [mealBoxes] = await productModule.createProductCategories([
          {
            name: "جعبه غذا",
            handle: "meal-boxes",
            is_active: true,
            parent_category_id: foodContainers.id,
          },
        ])
        foodContainersId = foodContainers.id
        mealBoxesId = mealBoxes.id
        labelsId = labels.id

        await createProductAttributesWorkflow(appContainer).run({
          input: {
            attributes: [
              {
                // Linked on the parent only — exactly what the seeder writes.
                name: "نوع پلیمر",
                handle: "polymer",
                type: "single_select",
                is_active: true,
                category_ids: [foodContainersId],
              },
              {
                name: "Meal box only",
                handle: "meal-box-only",
                type: "single_select",
                is_active: true,
                category_ids: [mealBoxesId],
              },
              {
                name: "Label only",
                handle: "label-only",
                type: "single_select",
                is_active: true,
                category_ids: [labelsId],
              },
              {
                name: "جنس",
                handle: "material",
                type: "single_select",
                is_active: true,
              },
            ],
          },
        })

        const apiKeyModule = appContainer.resolve(Modules.API_KEY)
        const key = await apiKeyModule.createApiKeys({
          title: "attribute ancestors test",
          type: "publishable",
          created_by: "test",
        })
        storeHeaders = { headers: { "x-publishable-api-key": key.token } }
      })

      const handles = (response: { data: { product_attributes: { handle: string }[] } }) =>
        response.data.product_attributes.map((a) => a.handle)

      it("offers a seller the parent-scoped attribute on a leaf category", async () => {
        const response = await api.get(
          `/vendor/product-attributes?category_id=${mealBoxesId}&limit=50`,
          vendorHeaders
        )

        expect(response.status).toEqual(200)
        expect(handles(response)).toEqual(
          expect.arrayContaining(["polymer", "meal-box-only", "material"])
        )
        expect(handles(response)).not.toContain("label-only")
      })

      it("does not push a child's attribute up to its parent", async () => {
        const response = await api.get(
          `/vendor/product-attributes?category_id=${foodContainersId}&limit=50`,
          vendorHeaders
        )

        expect(handles(response)).toEqual(
          expect.arrayContaining(["polymer", "material"])
        )
        expect(handles(response)).not.toContain("meal-box-only")
        expect(handles(response)).not.toContain("label-only")
      })

      it("gives the storefront rail of a leaf its parent's facets", async () => {
        const response = await api.get(
          `/store/product-attributes?category_id=${mealBoxesId}&limit=50`,
          storeHeaders
        )

        expect(response.status).toEqual(200)
        expect(handles(response)).toEqual(
          expect.arrayContaining(["polymer", "meal-box-only", "material"])
        )
        expect(handles(response)).not.toContain("label-only")
      })
    })
  },
})
