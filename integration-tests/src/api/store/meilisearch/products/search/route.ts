import { MedusaRequest, MedusaResponse } from '@medusajs/framework'

// Route shim — see src/api/admin/meilisearch/route.ts for why the require is gated.
const enabled = !!process.env.MEILISEARCH_HOST

// eslint-disable-next-line @typescript-eslint/no-var-requires
const block = enabled
  ? require('../../../../../../../packages/registry/src/meilisearch/api/store/meilisearch/products/search/route')
  : null

const notMounted = async (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(404).json({ message: 'meilisearch block is not mounted' })

export const POST = block?.POST ?? notMounted
