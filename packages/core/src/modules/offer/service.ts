import {
  InjectManager,
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import { Context, FindConfig } from "@medusajs/framework/types"
import { SqlEntityManager } from "@medusajs/framework/mikro-orm/postgresql"
import { OfferDTO } from "@mercurjs/types"

import { Offer, OfferDraft } from "./models"
import {
  CreateOfferDraftInput,
  CreateOfferDraftOutcome,
  CreatedOfferRef,
  findBlockingDraft,
  OfferDraftRefusals,
  OfferDraftRow,
  outcomeForKey,
} from "./offer-draft-rules"

type OfferFilters = Record<string, unknown> & {
  group_by_seller?: boolean
  include_drafts?: boolean
}

const toArray = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [value]).map(String)

/**
 * A grouped row whose `offer_ids` is empty is a store that has only drafts on
 * the product; its `id` is the newest open draft's.
 */
export type GroupedOfferRow = OfferDTO & { offer_draft_ids?: string[] }

class OfferModuleService extends MedusaService({
  Offer,
  OfferDraft,
}) {
  @InjectManager()
  // @ts-ignore - override narrows the generated signature
  async listOffers(
    filters: OfferFilters = {},
    config: FindConfig<OfferDTO> = {},
    @MedusaContext() sharedContext: Context = {}
  ): Promise<OfferDTO[]> {
    if (!filters.group_by_seller) {
      const { include_drafts: _drafts, ...plain } = filters
      return super.listOffers(
        plain,
        config,
        sharedContext
      ) as unknown as Promise<OfferDTO[]>
    }
    const [offers] = await this.listGroupedOffersBySeller_(
      filters,
      config,
      sharedContext
    )
    return offers
  }

  @InjectManager()
  // @ts-ignore - override narrows the generated signature
  async listAndCountOffers(
    filters: OfferFilters = {},
    config: FindConfig<OfferDTO> = {},
    @MedusaContext() sharedContext: Context = {}
  ): Promise<[OfferDTO[], number]> {
    if (!filters.group_by_seller) {
      const { include_drafts: _drafts, ...plain } = filters
      return super.listAndCountOffers(
        plain,
        config,
        sharedContext
      ) as unknown as Promise<[OfferDTO[], number]>
    }
    return this.listGroupedOffersBySeller_(filters, config, sharedContext)
  }

  /**
   * One row per (product, seller). With `include_drafts`, a store with only
   * open drafts on a product still gets its row — the admin list shows drafts
   * where offers are — as a synthetic row carrying the newest draft's id and
   * no `offer_ids`.
   */
  private async listGroupedOffersBySeller_(
    filters: OfferFilters,
    config: FindConfig<OfferDTO>,
    sharedContext: Context
  ): Promise<[OfferDTO[], number]> {
    const { group_by_seller: _flag, include_drafts, ...rest } = filters
    const skip = config.skip ?? 0
    const take = config.take ?? 20

    const { baseRepository_ } = this as unknown as {
      baseRepository_: { getActiveManager<T>(context?: Context): T }
    }
    const manager =
      baseRepository_.getActiveManager<SqlEntityManager>(sharedContext)
    const knex = manager.getKnex()

    const scoped = (table: "offer" | "offer_draft") => {
      const qb = knex(table).whereNull("deleted_at")
      if (table === "offer_draft") {
        qb.where("status", "open")
      }
      if (rest.product_id !== undefined) {
        qb.whereIn("product_id", toArray(rest.product_id))
      }
      if (rest.seller_id !== undefined) {
        qb.whereIn("seller_id", toArray(rest.seller_id))
      }
      return qb
    }

    const groups = () =>
      include_drafts
        ? scoped("offer")
            .select("product_id", "seller_id")
            .union(scoped("offer_draft").select("product_id", "seller_id"))
        : scoped("offer").distinct("product_id", "seller_id")

    const pageGroups = (await knex
      .select("product_id", "seller_id")
      .from(groups().as("groups"))
      .orderBy([{ column: "product_id" }, { column: "seller_id" }])
      .limit(take)
      .offset(skip)) as Array<{ product_id: string; seller_id: string }>

    const countRow = (await knex
      .count({ count: "*" })
      .from(groups().as("groups"))
      .first()) as { count?: string | number } | undefined
    const count = Number(countRow?.count ?? 0)

    if (!pageGroups.length) {
      return [[], count]
    }

    const pairs = pageGroups.map((g) => [g.product_id, g.seller_id])
    const groupKey = (row: { product_id: string; seller_id: string }) =>
      `${row.product_id}:${row.seller_id}`

    const [offerRows, draftRows] = (await Promise.all([
      scoped("offer")
        .whereIn(["product_id", "seller_id"], pairs)
        .select("id", "product_id", "seller_id")
        .orderBy("created_at", "desc"),
      include_drafts
        ? scoped("offer_draft")
            .whereIn(["product_id", "seller_id"], pairs)
            .select(
              "id",
              "product_id",
              "seller_id",
              "variant_id",
              "created_at",
              "updated_at"
            )
            .orderBy("created_at", "desc")
        : Promise.resolve([]),
    ])) as [
      Array<{ id: string; product_id: string; seller_id: string }>,
      Array<{
        id: string
        product_id: string
        seller_id: string
        variant_id: string | null
        created_at: Date
        updated_at: Date
      }>,
    ]

    const offerIdsByGroup = new Map<string, string[]>()
    for (const row of offerRows) {
      const key = groupKey(row)
      offerIdsByGroup.set(key, [...(offerIdsByGroup.get(key) ?? []), row.id])
    }
    const draftsByGroup = new Map<string, typeof draftRows>()
    for (const row of draftRows) {
      const key = groupKey(row)
      draftsByGroup.set(key, [...(draftsByGroup.get(key) ?? []), row])
    }

    const representativeIds = pageGroups
      .map((g) => offerIdsByGroup.get(groupKey(g))?.[0])
      .filter((id): id is string => !!id)

    const offers = representativeIds.length
      ? ((await super.listOffers(
          { id: representativeIds } as OfferFilters,
          { ...config, skip: 0, take: representativeIds.length },
          sharedContext
        )) as unknown as GroupedOfferRow[])
      : []
    const offerById = new Map(offers.map((offer) => [offer.id, offer]))

    const rows: GroupedOfferRow[] = []
    for (const group of pageGroups) {
      const key = groupKey(group)
      const offerIds = offerIdsByGroup.get(key) ?? []
      const drafts = draftsByGroup.get(key) ?? []
      const draftIds = drafts.map((d) => d.id)
      const offer = offerIds.length ? offerById.get(offerIds[0]) : undefined

      if (offer) {
        offer.variant_count = offerIds.length
        offer.offer_ids = offerIds
        offer.offer_draft_ids = draftIds
        rows.push(offer)
      } else if (drafts.length) {
        const [newest] = drafts
        rows.push({
          id: newest.id,
          product_id: group.product_id,
          seller_id: group.seller_id,
          variant_id: newest.variant_id,
          sku: null,
          variant_count: 0,
          offer_ids: [],
          offer_draft_ids: draftIds,
          created_at: newest.created_at,
          updated_at: newest.updated_at,
        } as unknown as GroupedOfferRow)
      }
    }

    return [rows, count]
  }

  private async lockDrafts(key: string, ctx: Context): Promise<void> {
    const manager = (ctx.transactionManager ?? ctx.manager) as SqlEntityManager
    await manager.execute("SELECT pg_advisory_xact_lock(hashtext(?))", [key])
  }

  private lockSellerProduct(sellerId: string, productId: string, ctx: Context) {
    return this.lockDrafts(`odraft:${sellerId}:${productId}`, ctx)
  }

  async listOfferDraftsByKey(
    externalId: string,
    ctx: Context = {}
  ): Promise<OfferDraftRow[]> {
    return (await this.listOfferDrafts(
      { external_id: externalId },
      {},
      ctx
    )) as unknown as OfferDraftRow[]
  }

  /**
   * Creating a draft and creating an offer race on "a draft never stays open
   * beside an offer that covers it". Both take this (seller, product) lock
   * before reading, and `closeOfferDrafts` only runs after the offer row has
   * committed — so either this sees the offer and refuses, or the close sees
   * the draft. `findActiveOfferIds` is called inside the lock for that reason.
   */
  @InjectTransactionManager()
  async createOrGetOfferDraft(
    input: CreateOfferDraftInput,
    findActiveOfferIds: () => Promise<string[]>,
    @MedusaContext() ctx: Context = {}
  ): Promise<CreateOfferDraftOutcome> {
    await this.lockDrafts(`odraft-key:${input.external_id}`, ctx)
    await this.lockSellerProduct(input.seller_id, input.product_id, ctx)

    const keyed = outcomeForKey(
      await this.listOfferDraftsByKey(input.external_id, ctx),
      input
    )
    if (keyed) {
      return keyed
    }

    const offerIds = await findActiveOfferIds()
    if (offerIds.length) {
      return {
        outcome: "refused",
        error: {
          code: OfferDraftRefusals.ACTIVE_OFFER_EXISTS,
          message: input.variant_id
            ? `Store ${input.seller_id} already has an offer on variant ${input.variant_id}`
            : `Store ${input.seller_id} already has an offer on product ${input.product_id}`,
          offer_ids: offerIds,
        },
      }
    }

    const open = (await this.listOfferDrafts(
      {
        seller_id: input.seller_id,
        product_id: input.product_id,
        status: "open",
      },
      {},
      ctx
    )) as unknown as OfferDraftRow[]
    const blocking = findBlockingDraft(open, input.variant_id)
    if (blocking) {
      return {
        outcome: "refused",
        error: {
          code: OfferDraftRefusals.OPEN_DRAFT_EXISTS,
          message: `Draft ${blocking.id} is already open for this store and ${
            blocking.variant_id ? `variant ${blocking.variant_id}` : "product"
          }`,
          draft_id: blocking.id,
        },
      }
    }

    const [draft] = await this.createOfferDrafts(
      [
        {
          seller_id: input.seller_id,
          product_id: input.product_id,
          variant_id: input.variant_id,
          external_id: input.external_id,
          metadata: input.metadata ?? null,
          created_by: input.created_by ?? null,
          status: "open",
        },
      ],
      ctx
    )
    return { outcome: "created", draft: draft as unknown as OfferDraftRow }
  }

  /**
   * Closes the open drafts the given offers cover — the draft on an offer's
   * variant, and a whole-product draft on its product — and returns their ids
   * so a compensation can reopen exactly those.
   */
  @InjectTransactionManager()
  async closeOfferDrafts(
    offers: CreatedOfferRef[],
    @MedusaContext() ctx: Context = {}
  ): Promise<string[]> {
    const groups = new Map<string, CreatedOfferRef[]>()
    for (const offer of offers) {
      if (!offer.seller_id || !offer.product_id) {
        continue
      }
      const key = `${offer.seller_id}:${offer.product_id}`
      groups.set(key, [...(groups.get(key) ?? []), offer])
    }

    // A fixed lock order, so two batches sharing groups cannot deadlock.
    const keys = [...groups.keys()].sort()
    for (const key of keys) {
      const [first] = groups.get(key)!
      await this.lockSellerProduct(first.seller_id, first.product_id!, ctx)
    }

    const now = new Date()
    const updates: {
      id: string
      status: "completed"
      completed_offer_id: string
      completed_at: Date
    }[] = []

    for (const key of keys) {
      const group = groups.get(key)!
      const open = (await this.listOfferDrafts(
        {
          seller_id: group[0].seller_id,
          product_id: group[0].product_id,
          status: "open",
        },
        {},
        ctx
      )) as unknown as OfferDraftRow[]

      for (const draft of open) {
        const offer = draft.variant_id
          ? group.find((o) => o.variant_id === draft.variant_id)
          : group[0]
        if (offer) {
          updates.push({
            id: draft.id,
            status: "completed",
            completed_offer_id: offer.id,
            completed_at: now,
          })
        }
      }
    }

    if (updates.length) {
      await this.updateOfferDrafts(updates, ctx)
    }
    return updates.map((u) => u.id)
  }

  @InjectTransactionManager()
  async reopenOfferDrafts(
    ids: string[],
    @MedusaContext() ctx: Context = {}
  ): Promise<void> {
    if (!ids.length) {
      return
    }
    await this.updateOfferDrafts(
      ids.map((id) => ({
        id,
        status: "open" as const,
        completed_offer_id: null,
        completed_at: null,
      })),
      ctx
    )
  }
}

export default OfferModuleService
