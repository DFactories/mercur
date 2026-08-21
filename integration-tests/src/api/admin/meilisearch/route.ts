import { MedusaRequest, MedusaResponse } from '@medusajs/framework'

// Route shim: the meilisearch feature ships in @mercurjs/registry as an installable
// block rather than in @mercurjs/core, so the test app mounts it the way a real
// project would after `mercurjs add meilisearch`.
//
// The block pulls in the `meilisearch` npm package, which is ESM-only and cannot be
// require()d under this Node/Jest combination. Only the dedicated meilisearch run
// mocks that package, so the import stays behind the env gate — otherwise every
// other HTTP suite would fail to boot while registering API routes.
const enabled = !!process.env.MEILISEARCH_HOST

// eslint-disable-next-line @typescript-eslint/no-var-requires
const block = enabled
  ? require('../../../../../packages/registry/src/meilisearch/api/admin/meilisearch/route')
  : null

const notMounted = async (_req: MedusaRequest, res: MedusaResponse) =>
  res.status(404).json({ message: 'meilisearch block is not mounted' })

export const GET = block?.GET ?? notMounted
export const POST = block?.POST ?? notMounted
