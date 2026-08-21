import { defineMiddlewares } from '@medusajs/medusa'
import type { MiddlewareRoute } from '@medusajs/framework'

// Only mounted for the dedicated `test:integration:meilisearch` run — the default
// HTTP suite boots without the meilisearch module registered. The require is gated
// (rather than a static import) for the same reason as the route shims: it keeps the
// registry block out of the module graph when the block is not mounted.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const routes: MiddlewareRoute[] = process.env.MEILISEARCH_HOST
  ? require('../../../packages/registry/src/meilisearch/api/middlewares')
      .allMeilisearchMiddlewares
  : []

export default defineMiddlewares({ routes })
