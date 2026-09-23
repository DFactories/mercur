// Force the product-request approval queue ON for this suite, as production
// runs it. The shared test env ships `MEDUSA_FF_PRODUCT_REQUEST=false`, and
// `loadEnv` (dotenv) does not override an already-set value.
process.env.MEDUSA_FF_PRODUCT_REQUEST = "true"

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  MercurModules,
  ProductChangeActionType,
  ProductChangeStatus,
  ProductStatus,
} from "@mercurjs/types"
import { createProductsWorkflow } from "@mercurjs/core/workflows"

import {
  adminHeaders,
  createAdminUser,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"

jest.setTimeout(120_000)

const PENDING_MESSAGE =
  "There is already an active update request for this product. Only one request can be active at a time."

/**
 * REGRESSION — production, 2026-09-23.
 *
 * A producer edited their own DRAFT product. Every edit became a
 * `product_change` waiting for an operator, and while one was pending every
 * further `POST /vendor/products/:id`, `POST …/attributes/batch` AND
 * `DELETE /vendor/products/:id` answered 400 "There is already an active
 * update request…" — 17 refusals in 50 minutes. The producer could neither fix
 * nor delete the draft and created a duplicate product instead.
 *
 * Decided (2026-09-23): a product nobody can buy yet — draft, proposed,
 * rejected — is edited and deleted directly; a request left pending on it from
 * before is canceled, because approving it later would write stale values over
 * the newer edit. Only a PUBLISHED product's edits wait for an operator, and
 * only there does an open request still refuse the next one.
 *
 * The same review found the routes accepted any product id: one store could
 * read another's drafts and delete them (a draft delete was already applied
 * inline). Another store's unpublished product is now a 404 — pinned here,
 * because applying edits directly would otherwise have turned it into direct
 * write access. A published master product stays open to change REQUESTS from
 * any seller, as Mercur designs the shared catalog; those still queue.
 */
medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api, dbConnection }) => {
    describe("Vendor edits to unpublished products", () => {
      let container: MedusaContainer
      let seller: { id: string }
      let sellerHeaders: { headers: Record<string, string> }
      let otherHeaders: { headers: Record<string, string> }

      beforeAll(async () => {
        container = getContainer()
      })

      beforeEach(async () => {
        await createAdminUser(dbConnection, adminHeaders, container)

        const owner = await createSellerUser(container, {
          email: "unpublished-owner@test.com",
          name: "Unpublished Owner",
        })
        seller = owner.seller as { id: string }
        sellerHeaders = owner.headers

        const other = await createSellerUser(container, {
          email: "unpublished-other@test.com",
          name: "Unpublished Other",
        })
        otherHeaders = other.headers
      })

      const createProduct = async (
        title: string,
        status: "draft" | "proposed",
        headers = sellerHeaders,
      ): Promise<string> => {
        const res = await api.post(
          `/vendor/products`,
          { title, status, variants: [{ title: "Default" }] },
          headers,
        )
        expect(res.data.product.status).toBe(status)
        return res.data.product.id
      }

      const createPublished = async (title: string, headers = sellerHeaders) => {
        const id = await createProduct(title, "proposed", headers)
        await api.post(`/admin/products/${id}/confirm`, {}, adminHeaders)
        return id
      }

      const createRejected = async (title: string) => {
        const id = await createProduct(title, "proposed")
        await api.post(
          `/admin/products/${id}/reject`,
          { message: "Missing photos" },
          adminHeaders,
        )
        return id
      }

      /** A shared catalog product: created by the operator, linked to no seller. */
      const createMasterProduct = async (title: string) => {
        const { result } = await createProductsWorkflow(container).run({
          input: {
            products: [
              { title, status: "published", variants: [{ title: "Default" }] },
            ],
            created_by: "operator",
          },
        })
        return (result as { id: string }[])[0].id
      }

      const getProduct = async (id: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product",
          fields: ["id", "title", "status", "variants.id", "variants.title"],
          filters: { id },
        })
        return data[0] as
          | {
              id: string
              title: string
              status: string
              variants: { id: string; title: string }[]
            }
          | undefined
      }

      const changeStatus = async (changeId: string) => {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product_change",
          fields: ["id", "status", "canceled_by"],
          filters: { id: changeId },
        })
        return data[0] as { status: string; canceled_by: string | null }
      }

      /**
       * The state production was left in: a pending request on an unpublished
       * product. The API can no longer produce one, so it is seeded here.
       */
      const seedPendingChange = async (productId: string) => {
        const service: any = container.resolve(MercurModules.PRODUCT_EDIT)
        const [change] = await service.createProductChanges([
          {
            product_id: productId,
            created_by: seller.id,
            status: ProductChangeStatus.PENDING,
          },
        ])
        await service.createProductChangeActions([
          {
            product_change_id: change.id,
            product_id: productId,
            action: ProductChangeActionType.UPDATE,
            details: { field: "title", value: "Stale pending title" },
          },
        ])
        return change.id as string
      }

      const refused = (promise: Promise<unknown>) =>
        promise.then(
          () => {
            throw new Error("expected the request to be refused")
          },
          (e) => e.response,
        )

      /** Sent one at a time, so no rejection sits unobserved. */
      const allRefused = async (attempts: Array<() => Promise<unknown>>) => {
        const responses: any[] = []
        for (const attempt of attempts) {
          responses.push(await refused(attempt()))
        }
        return responses
      }

      describe("a draft with a request already pending (the production case)", () => {
        it("applies the edit directly and cancels the stale request", async () => {
          const productId = await createProduct("Draft", "draft")
          const staleId = await seedPendingChange(productId)

          const res = await api.post(
            `/vendor/products/${productId}`,
            { title: "Fixed title" },
            sellerHeaders,
          )

          expect(res.status).toBe(202)
          expect(res.data.product_change.status).toBe(
            ProductChangeStatus.CONFIRMED,
          )
          expect((await getProduct(productId))!.title).toBe("Fixed title")

          const stale = await changeStatus(staleId)
          expect(stale.status).toBe(ProductChangeStatus.CANCELED)
          expect(stale.canceled_by).toBe(seller.id)
        })

        it("applies an attribute batch directly", async () => {
          const productId = await createProduct("Draft attrs", "draft")
          await seedPendingChange(productId)

          const res = await api.post(
            `/vendor/products/${productId}/attributes/batch`,
            { add: [{ title: "Material", type: "text", value: "Steel" }] },
            sellerHeaders,
          )

          expect(res.status).toBe(202)
          expect(res.data.product_change.status).toBe(
            ProductChangeStatus.CONFIRMED,
          )
        })

        it("applies a variant edit directly", async () => {
          const productId = await createProduct("Draft variants", "draft")
          await seedPendingChange(productId)
          const [variant] = (await getProduct(productId))!.variants

          const res = await api.post(
            `/vendor/products/${productId}/variants/${variant.id}`,
            { title: "Renamed" },
            sellerHeaders,
          )

          expect(res.status).toBe(202)
          expect(res.data.product_change.status).toBe(
            ProductChangeStatus.CONFIRMED,
          )
          expect((await getProduct(productId))!.variants[0].title).toBe(
            "Renamed",
          )
        })

        it("deletes the draft", async () => {
          const productId = await createProduct("Draft to delete", "draft")
          const staleId = await seedPendingChange(productId)

          const res = await api.delete(
            `/vendor/products/${productId}`,
            sellerHeaders,
          )

          expect(res.status).toBe(202)
          expect(await getProduct(productId)).toBeUndefined()
          expect((await changeStatus(staleId)).status).toBe(
            ProductChangeStatus.CANCELED,
          )
        })
      })

      it("edits a proposed product directly — the operator reviews it whole on confirm", async () => {
        const productId = await createProduct("Proposed", "proposed")

        const res = await api.post(
          `/vendor/products/${productId}`,
          { title: "Proposed, corrected" },
          sellerHeaders,
        )

        expect(res.data.product_change.status).toBe(
          ProductChangeStatus.CONFIRMED,
        )
        const product = (await getProduct(productId))!
        expect(product.title).toBe("Proposed, corrected")
        expect(product.status).toBe(ProductStatus.PROPOSED)
      })

      it("deletes a proposed product directly", async () => {
        const productId = await createProduct("Proposed to delete", "proposed")

        await api.delete(`/vendor/products/${productId}`, sellerHeaders)

        expect(await getProduct(productId)).toBeUndefined()
      })

      it("edits a rejected product directly", async () => {
        const productId = await createRejected("Rejected")

        const res = await api.post(
          `/vendor/products/${productId}`,
          { title: "Rejected, fixed" },
          sellerHeaders,
        )

        expect(res.data.product_change.status).toBe(
          ProductChangeStatus.CONFIRMED,
        )
        expect((await getProduct(productId))!.title).toBe("Rejected, fixed")
      })

      describe("a published product still goes through approval", () => {
        it("queues the edit, and refuses the next one until it is resolved", async () => {
          const productId = await createPublished("Live")

          const first = await api.post(
            `/vendor/products/${productId}`,
            { title: "Live v2" },
            sellerHeaders,
          )
          expect(first.data.product_change.status).toBe(
            ProductChangeStatus.PENDING,
          )
          expect((await getProduct(productId))!.title).toBe("Live")

          const responses = await allRefused([
            () =>
              api.post(
                `/vendor/products/${productId}`,
                { title: "Live v3" },
                sellerHeaders,
              ),
            () =>
              api.post(
                `/vendor/products/${productId}/attributes/batch`,
                { add: [{ title: "Finish", type: "text", value: "Matte" }] },
                sellerHeaders,
              ),
            () => api.delete(`/vendor/products/${productId}`, sellerHeaders),
          ])
          for (const res of responses) {
            expect(res.status).toBe(400)
            expect(res.data.message).toBe(PENDING_MESSAGE)
          }

          // Canceling the open request frees the product again.
          await api.post(`/vendor/products/${productId}/cancel`, {}, sellerHeaders)
          const again = await api.post(
            `/vendor/products/${productId}`,
            { title: "Live v3" },
            sellerHeaders,
          )
          expect(again.data.product_change.status).toBe(
            ProductChangeStatus.PENDING,
          )
        })

        it("is not blocked by a request pending on a different product", async () => {
          const busy = await createPublished("Busy")
          const idle = await createPublished("Idle")
          await api.post(
            `/vendor/products/${busy}`,
            { title: "Busy v2" },
            sellerHeaders,
          )

          const res = await api.post(
            `/vendor/products/${idle}`,
            { title: "Idle v2" },
            sellerHeaders,
          )
          expect(res.status).toBe(202)
        })
      })

      describe("ownership", () => {
        it("refuses every write to another store's unpublished product with 404", async () => {
          const productId = await createProduct("Not yours", "draft")
          const [variant] = (await getProduct(productId))!.variants

          const responses = await allRefused([
            () =>
              api.post(
                `/vendor/products/${productId}`,
                { title: "x" },
                otherHeaders,
              ),
            () => api.delete(`/vendor/products/${productId}`, otherHeaders),
            () =>
              api.post(
                `/vendor/products/${productId}/attributes/batch`,
                { add: [{ title: "Hijack", type: "text", value: "x" }] },
                otherHeaders,
              ),
            () =>
              api.post(
                `/vendor/products/${productId}/variants`,
                { title: "Extra" },
                otherHeaders,
              ),
            () =>
              api.post(
                `/vendor/products/${productId}/variants/${variant.id}`,
                { title: "x" },
                otherHeaders,
              ),
            () =>
              api.delete(
                `/vendor/products/${productId}/variants/${variant.id}`,
                otherHeaders,
              ),
            () =>
              api.post(`/vendor/products/${productId}/submit`, {}, otherHeaders),
            () =>
              api.post(`/vendor/products/${productId}/cancel`, {}, otherHeaders),
          ])
          expect(responses.map((res) => res.status)).toEqual(
            responses.map(() => 404),
          )

          const product = (await getProduct(productId))!
          expect(product.title).toBe("Not yours")
          expect(product.variants.map((v) => v.title)).toEqual(["Default"])
        })

        it("lets another seller only REQUEST a change to a shared master product", async () => {
          const productId = await createMasterProduct("Shared master")

          const edit = await api.post(
            `/vendor/products/${productId}`,
            { title: "Suggested title" },
            otherHeaders,
          )
          expect(edit.data.product_change.status).toBe(
            ProductChangeStatus.PENDING,
          )
          expect((await getProduct(productId))!.title).toBe("Shared master")
        })

        it("hides another store's products, but not a shared master product", async () => {
          const draft = await createProduct("Private draft", "draft")
          const own = await createPublished("Owned and live")
          const master = await createMasterProduct("Public master")

          expect(
            (await refused(api.get(`/vendor/products/${draft}`, otherHeaders)))
              .status,
          ).toBe(404)
          expect(
            (
              await refused(
                api.get(`/vendor/products/${draft}/variants`, otherHeaders),
              )
            ).status,
          ).toBe(404)
          // Published but linked to its creator: listed to nobody else, so
          // not reachable by id either.
          expect(
            (await refused(api.get(`/vendor/products/${own}`, otherHeaders)))
              .status,
          ).toBe(404)
          expect(
            (await api.get(`/vendor/products/${master}`, otherHeaders)).status,
          ).toBe(200)
        })

        it("refuses a variant that belongs to a different product", async () => {
          const mine = await createProduct("Mine", "draft")
          const theirs = await createProduct("Theirs", "draft", otherHeaders)
          const [theirVariant] = (await getProduct(theirs))!.variants

          const res = await refused(
            api.post(
              `/vendor/products/${mine}/variants/${theirVariant.id}`,
              { title: "Hijacked" },
              sellerHeaders,
            ),
          )

          expect(res.status).toBe(404)
          expect((await getProduct(theirs))!.variants[0].title).toBe("Default")
        })
      })

      describe("POST /vendor/products/:id/submit", () => {
        it("sends a draft in for review", async () => {
          const productId = await createProduct("Ready", "draft")
          const staleId = await seedPendingChange(productId)

          const res = await api.post(
            `/vendor/products/${productId}/submit`,
            {},
            sellerHeaders,
          )

          expect(res.status).toBe(200)
          expect(res.data.product.status).toBe(ProductStatus.PROPOSED)
          expect((await changeStatus(staleId)).status).toBe(
            ProductChangeStatus.CANCELED,
          )
        })

        it("sends a rejected product back in for review", async () => {
          const productId = await createRejected("Second try")

          const res = await api.post(
            `/vendor/products/${productId}/submit`,
            {},
            sellerHeaders,
          )

          expect(res.data.product.status).toBe(ProductStatus.PROPOSED)
        })

        it("refuses a product that is already proposed or published", async () => {
          const proposed = await createProduct("Waiting", "proposed")
          const live = await createPublished("Live already")

          for (const id of [proposed, live]) {
            const res = await refused(
              api.post(`/vendor/products/${id}/submit`, {}, sellerHeaders),
            )
            expect(res.status).toBe(400)
          }
        })
      })
    })
  },
})
