import { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MercurModules } from "@mercurjs/types"

import {
  generatePublishableKey,
  generateStoreHeaders,
} from "../../../helpers/create-admin-user"
import { createSellerUser } from "../../../helpers/create-seller-user"
import {
  customerHeaders,
  createCustomerUser,
} from "../../../helpers/create-customer-user"

jest.setTimeout(60000)

const SELLER_MODULE = "seller"

/**
 * `/store/reviews` is the only review surface upstream ships no tests for, and it
 * is the one this fork's storefront actually calls. The storefront asks for
 * `fields=*seller,+customer.id,+order_id`, none of which are columns on `Review`
 * -- they resolve through the links 2.3.1 added. If that request 400s, the
 * customer review pages break the moment this ships, so it is asserted verbatim
 * rather than approximated.
 */
const seedReview = async (
  container: MedusaContainer,
  sellerId: string,
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
  ])

  return review
}

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Store - Reviews", () => {
      let appContainer: MedusaContainer
      let sellerId: string
      let storeHeaders: Record<string, Record<string, string>>

      beforeEach(async () => {
        appContainer = getContainer()

        const result = await createSellerUser(appContainer, {
          email: "review-seller@test.com",
          name: "Review Store",
        })
        sellerId = (result.seller as { id: string }).id

        await createCustomerUser(appContainer, {
          email: "reviewer@test.com",
        })

        const publishableKey = await generatePublishableKey(appContainer)
        const base = generateStoreHeaders({ publishableKey })
        // the store routes need the publishable key AND a customer identity
        storeHeaders = {
          headers: { ...base.headers, ...customerHeaders.headers },
        }
      })

      it("lists reviews", async () => {
        await seedReview(appContainer, sellerId)

        const response = await api
          .get(`/store/reviews`, storeHeaders)
          .catch((e) => e.response)

        expect(response.status).toEqual(200)
        expect(Array.isArray(response.data.reviews)).toBe(true)
      })

      it("accepts the exact field selection the storefront sends", async () => {
        await seedReview(appContainer, sellerId)

        const response = await api
          .get(
            `/store/reviews?fields=*seller,+customer.id,+order_id`,
            storeHeaders
          )
          .catch((e) => e.response)

        expect(response.status).toEqual(200)
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
