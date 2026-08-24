import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MercurModules } from "@mercurjs/types"

import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../helpers/create-admin-user"
import { createSellerUser } from "../../helpers/create-seller-user"
import {
  customerHeaders,
  createCustomerUser,
} from "../../helpers/create-customer-user"

jest.setTimeout(60000)

const SELLER_MODULE = "seller"

/**
 * REGRESSION — `/store/reviews` is the only review surface upstream ships no
 * tests for, and it is the one this fork's storefront actually calls.
 *
 * Two contracts are asserted, because the storefront breaks silently if either
 * moves:
 *
 * 1. The field selection. The storefront sends
 *    `fields=*seller,+customer.id,+order_id` — none of which are columns on
 *    `Review`; they resolve through the links 2.3.1 added. Asserting a 200 is
 *    not enough: the route filters the list down to the CALLER's own reviews, so
 *    a review that is not linked to the requesting customer makes every
 *    assertion pass against an empty array. The seeding below links customer and
 *    seller both, and the rows are asserted, so `*seller` is genuinely resolved.
 *
 * 2. `status` on a freshly created review. 2.3.1 moderates reviews and defaults
 *    them to `pending`, which is why the storefront's producer page filters to
 *    `published`. If that default ever changed to `published`, the storefront
 *    would keep working and the moderation queue would quietly stop existing —
 *    so the default is pinned here rather than assumed.
 */
const seedReview = async (
  container: MedusaContainer,
  { sellerId, customerId }: { sellerId: string; customerId: string },
  overrides: Record<string, unknown> = {}
) => {
  const service = container.resolve(MercurModules.REVIEW)
  const link = container.resolve(ContainerRegistrationKeys.LINK)

  const review = await service.createReviews({
    reference: "seller",
    rating: 5,
    customer_note: "چه فروشگاه خوبی",
    status: "published",
    ...overrides,
  })

  await link.create([
    {
      [SELLER_MODULE]: { seller_id: sellerId },
      [MercurModules.REVIEW]: { review_id: review.id },
    },
    {
      [Modules.CUSTOMER]: { customer_id: customerId },
      [MercurModules.REVIEW]: { review_id: review.id },
    },
  ])

  return review
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Reviews", () => {
      let appContainer: MedusaContainer
      let sellerId: string
      let customerId: string
      let storeHeaders: Record<string, Record<string, string>>

      beforeEach(async () => {
        appContainer = getContainer()

        const result = await createSellerUser(appContainer, {
          email: "review-seller@test.com",
          name: "Review Store",
        })
        sellerId = (result.seller as { id: string }).id

        const { customer } = await createCustomerUser(appContainer, {
          email: "reviewer@test.com",
        })
        customerId = customer.id

        const publishableKey = await generatePublishableKey(appContainer)
        const base = generateStoreHeaders({ publishableKey })
        // the store routes need the publishable key AND a customer identity
        storeHeaders = {
          headers: { ...base.headers, ...customerHeaders.headers },
        }
      })

      it("lists the caller's own reviews", async () => {
        await seedReview(appContainer, { sellerId, customerId })

        const response = await api
          .get(`/store/reviews`, storeHeaders)
          .catch((e) => e.response)

        expect(response.status).toEqual(200)
        expect(response.data.reviews).toHaveLength(1)
        expect(response.data.reviews[0]).toMatchObject({
          reference: "seller",
          rating: 5,
          status: "published",
        })
      })

      it("resolves the exact field selection the storefront sends", async () => {
        await seedReview(appContainer, { sellerId, customerId })

        const response = await api
          .get(
            `/store/reviews?fields=*seller,+customer.id,+order_id`,
            storeHeaders
          )
          .catch((e) => e.response)

        expect(response.status).toEqual(200)
        expect(response.data.reviews).toHaveLength(1)
        // the whole point of the request: `seller` is a link, not a column
        expect(response.data.reviews[0].seller).toMatchObject({
          id: sellerId,
          name: "Review Store",
        })
      })

      it("does not leak another customer's reviews", async () => {
        // createCustomerUser rewrites the shared header bag, so this must come
        // after `storeHeaders` snapshotted the reviewer's own token in
        // beforeEach — which it does.
        const { customer: other } = await createCustomerUser(appContainer, {
          email: "someone-else@test.com",
        })
        await seedReview(appContainer, { sellerId, customerId: other.id })

        const response = await api
          .get(`/store/reviews`, storeHeaders)
          .catch((e) => e.response)

        expect(response.status).toEqual(200)
        expect(response.data.reviews).toHaveLength(0)
      })

      it("creates a review as `pending`, so moderation actually gates it", async () => {
        const service = appContainer.resolve(MercurModules.REVIEW)

        const review = await service.createReviews({
          reference: "seller",
          rating: 4,
          customer_note: "خوب بود",
        })

        expect(review.status).toEqual("pending")
      })

      it("rejects a rating outside 1..5", async () => {
        const response = await api
          .post(
            `/store/reviews`,
            {
              order_id: "order_does_not_matter",
              reference: "seller",
              reference_id: sellerId,
              rating: 9,
              customer_note: "بیش از حد",
            },
            storeHeaders
          )
          .catch((e) => e.response)

        expect(response.status).toEqual(400)
      })
    })
  },
})
