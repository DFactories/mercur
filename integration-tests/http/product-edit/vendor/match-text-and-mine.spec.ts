import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@mercurjs/core/workflows"
import { MercurModules } from "@mercurjs/types"

import { createSellerUser } from "../../../helpers/create-seller-user"

jest.setTimeout(90_000)

/**
 * Production, 2026-10-06: one option held «کارتن 500 عددی» and
 * «کارتن ۵۰۰ عددی», and a variant saved with one could not be approved against
 * the other. Decided 2026-10-07: matching fields are stored in one spelling,
 * a search finds the same products whichever keyboard typed the number, and
 * the products page opens on the store's own products.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor products — one spelling, and «mine»", () => {
      let container: MedusaContainer
      let sellerHeaders: { headers: Record<string, string> }
      let sellerId: string

      beforeAll(() => {
        container = getContainer()
      })

      beforeEach(async () => {
        const res = await createSellerUser(container, {
          email: "match-seller@test.com",
          name: "Match Seller",
        })
        sellerHeaders = res.headers
        sellerId = sellerHeaders.headers["x-seller-id"]
      })

      const createDraft = async (title: string) => {
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: [{ title, status: "draft", variants: [{ title: "Default" }] }],
            created_by: sellerId,
          },
        })
        return (result as { id: string }[])[0].id
      }

      const variantsOf = async (productId: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "variant",
          fields: ["id", "sku", "options.value", "options.option.title"],
          filters: { product_id: productId },
        })
        return (data as {
          sku: string | null
          options: { value: string; option: { title: string } }[]
        }[]).map((v) => ({
          sku: v.sku,
          options: Object.fromEntries(
            (v.options ?? []).map((o) => [o.option.title, o.value]),
          ),
        }))
      }

      it("stores an axis typed with Arabic letters and Persian digits in one spelling", async () => {
        const productId = await createDraft("ظرف تک پرس کد ۱۰۵")

        const res = await api.post(
          `/vendor/products/${productId}/attributes/batch`,
          {
            add: [
              {
                title: "بسته بندي",
                values: ["كارتن ۵۰۰ عددی", "کارتن ۱۰۰۰عددی"],
                is_variant_axis: true,
              },
            ],
          },
          sellerHeaders,
        )
        expect(res.status).toBe(202)

        const spellings = ["کارتن 1000 عددی", "کارتن 500 عددی"]
        const [variant] = await variantsOf(productId)
        expect(Object.keys(variant.options)).toEqual(["بسته بندی"])
        expect(spellings).toContain(variant.options["بسته بندی"])

        // The other value, typed on a different keyboard again.
        const other = variant.options["بسته بندی"] === spellings[0]
          ? "كارتن ٥٠٠ عددی"
          : "کارتن ١٠٠٠عددی"
        const added = await api.post(
          `/vendor/products/${productId}/variants`,
          {
            title: "دوم",
            sku: "AL۱۰۵-۲",
            options: { "بسته بندي": other },
          },
          sellerHeaders,
        )
        expect(added.status).toBeLessThan(300)

        const variants = await variantsOf(productId)
        expect(variants.map((v) => v.options["بسته بندی"]).sort()).toEqual(spellings)
        expect(variants.map((v) => v.sku)).toContain("AL105-2")
      })

      it("accepts the Latin spelling of a value saved before normalization", async () => {
        const productModule = container.resolve(Modules.PRODUCT)
        const productId = await createDraft("دیس کوچک")
        // As core .34 left it: the option's value in Persian digits.
        const [option] = await productModule.createProductOptions([
          {
            title: "بسته بندی",
            values: ["کارتن ۵۰۰ عددی", "کارتن ۱۰۰۰ عددی"],
            is_exclusive: true,
          },
        ] as never)
        await productModule.updateProducts(productId, {
          option_ids: [(option as { id: string }).id],
          variants: [
            {
              id: (await productModule.listProductVariants({ product_id: productId }))[0].id,
              options: { "بسته بندی": "کارتن ۵۰۰ عددی" },
            },
          ],
        } as never)

        const res = await api.post(
          `/vendor/products/${productId}/variants`,
          { title: "دوم", options: { "بسته بندی": "کارتن 1000 عددی" } },
          sellerHeaders,
        )
        expect(res.status).toBeLessThan(300)
        const variants = await variantsOf(productId)
        expect(variants.map((v) => v.options["بسته بندی"]).sort()).toEqual(
          ["کارتن ۱۰۰۰ عددی", "کارتن ۵۰۰ عددی"].sort(),
        )
      })

      it("finds a product by its number in either spelling", async () => {
        const productId = await createDraft("ظرف تک پرس کد ۱۰۵")
        await createDraft("ظرف دیس کد ۲۳۰")

        for (const q of ["105", "۱۰۵"]) {
          const { data } = await api.get(
            `/vendor/products?q=${encodeURIComponent(q)}&fields=id`,
            sellerHeaders,
          )
          expect(data.products.map((p: { id: string }) => p.id)).toEqual([productId])
        }
      })

      it("narrows the list to the store's own products and the ones it sells", async () => {
        const own = await createDraft("محصول خودم")

        // Another store's published product: the shared catalogue.
        const productModule = container.resolve(Modules.PRODUCT)
        const [shared, sold] = await productModule.createProducts([
          { title: "محصول دیگران", status: "published", variants: [{ title: "V" }] },
          { title: "محصول دیگران که می‌فروشم", status: "published", variants: [{ title: "V" }] },
        ] as never)

        const offers = container.resolve(MercurModules.OFFER) as {
          createOfferDrafts: (data: unknown[]) => Promise<unknown>
        }
        await offers.createOfferDrafts([
          { seller_id: sellerId, product_id: (sold as { id: string }).id, status: "open" },
        ])

        const ids = async (query: string) =>
          (
            await api.get(`/vendor/products?fields=id${query}`, sellerHeaders)
          ).data.products.map((p: { id: string }) => p.id).sort()

        expect(await ids("")).toEqual(
          [own, (shared as { id: string }).id, (sold as { id: string }).id].sort(),
        )
        expect(await ids("&mine=true")).toEqual(
          [own, (sold as { id: string }).id].sort(),
        )
        expect(await ids("&mine=false")).toEqual(await ids(""))
      })
    })
  },
})
