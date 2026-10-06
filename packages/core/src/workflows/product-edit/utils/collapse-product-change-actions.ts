import {
  ProductAttributeBatchUpdate,
  ProductChangeActionType,
} from "@mercurjs/types"

export type CollapsibleProductChangeAction = {
  id: string
  product_id: string
  action: string
  details: Record<string, unknown> | null
  ordering?: number | null
  created_at?: string | Date | null
  applied?: boolean | null
}

type ImageDelta = { add?: string[]; remove?: string[] }

const batchKey = (action: CollapsibleProductChangeAction) => {
  const at = action.created_at
  if (!at) {
    return `ordering:${action.ordering ?? 0}`
  }
  return at instanceof Date ? at.toISOString() : String(at)
}

const byOrdering = (
  a: CollapsibleProductChangeAction,
  b: CollapsibleProductChangeAction,
) => (a.ordering ?? 0) - (b.ordering ?? 0)

const netImages = (base: ImageDelta | undefined, next: ImageDelta) => {
  const add = new Set(base?.add ?? [])
  const remove = new Set(base?.remove ?? [])
  for (const id of next.add ?? []) {
    if (remove.has(id)) {
      remove.delete(id)
    } else {
      add.add(id)
    }
  }
  for (const id of next.remove ?? []) {
    if (add.has(id)) {
      add.delete(id)
    } else {
      remove.add(id)
    }
  }
  return { add: [...add], remove: [...remove] }
}

const netIds = <T>(
  base: T[] | undefined,
  againstBase: T[] | undefined,
  next: T[] | undefined,
  againstNext: T[] | undefined,
) => {
  const keyOf = (v: T) => (typeof v === "string" ? v : JSON.stringify(v))
  const result = new Map<string, T>()
  const opposite = new Set((againstNext ?? []).map(keyOf))
  for (const v of base ?? []) {
    if (!opposite.has(keyOf(v))) {
      result.set(keyOf(v), v)
    }
  }
  const cancelled = new Set((againstBase ?? []).map(keyOf))
  for (const v of next ?? []) {
    if (!cancelled.has(keyOf(v))) {
      result.set(keyOf(v), v)
    }
  }
  return [...result.values()]
}

const mergeAttributeUpdate = (
  base: ProductAttributeBatchUpdate,
  next: ProductAttributeBatchUpdate,
): ProductAttributeBatchUpdate => {
  const merged: ProductAttributeBatchUpdate = { id: base.id }
  const title = next.title ?? base.title
  if (title !== undefined) merged.title = title
  const value = next.value !== undefined ? next.value : base.value
  if (value !== undefined) merged.value = value
  const add = netIds(base.add, base.remove, next.add, next.remove)
  const remove = netIds(
    base.remove,
    base.add as string[] | undefined,
    next.remove,
    next.add as string[] | undefined,
  )
  if (add.length) merged.add = add
  if (remove.length) merged.remove = remove
  return merged
}

type AttributeState = {
  remove: CollapsibleProductChangeAction | null
  add: CollapsibleProductChangeAction | null
  update: CollapsibleProductChangeAction | null
}

/**
 * Folds every action of an open request into the edit an operator should
 * review and apply. A request now accumulates several saves, each recorded as
 * its own diff against the live product, so the same field, variant or
 * attribute can appear more than once: the latest save wins, while the
 * "before" value is the one the first save saw.
 *
 * Actions written by one save share a `created_at`, and inside such a batch an
 * attribute that is removed AND added is a re-attach, not a removal — so
 * attributes are resolved batch by batch rather than action by action.
 */
export const collapseProductChangeActions = <
  T extends CollapsibleProductChangeAction,
>(
  actions: T[],
): T[] => {
  const sorted = [...actions].sort(byOrdering)

  const productFields = new Map<string, T>()
  const statusChange: { action: T | null; previous: unknown } = {
    action: null,
    previous: undefined,
  }
  const variantUpdates = new Map<string, T>()
  const variantRemoves = new Map<string, T>()
  const passthrough: T[] = []
  const inlineAttributeAdds: T[] = []
  const attributes = new Map<string, AttributeState>()

  const batches = new Map<string, T[]>()
  for (const action of sorted) {
    const key = batchKey(action)
    const batch = batches.get(key) ?? []
    batch.push(action)
    batches.set(key, batch)
  }

  for (const batch of batches.values()) {
    const batchAttributes = new Map<string, AttributeState>()

    for (const action of batch) {
      const details = (action.details ?? {}) as Record<string, unknown>

      switch (action.action) {
        case ProductChangeActionType.UPDATE: {
          const field = details.field as string | undefined
          if (!field) {
            passthrough.push(action)
            break
          }
          const earlier = productFields.get(field)
          productFields.set(field, {
            ...action,
            details: {
              ...details,
              ...(earlier
                ? {
                    previous_value: (earlier.details ?? {}).previous_value,
                  }
                : {}),
            },
          })
          break
        }
        case ProductChangeActionType.STATUS_CHANGE: {
          if (!statusChange.action) {
            statusChange.previous = details.previous_status
          }
          statusChange.action = action
          break
        }
        case ProductChangeActionType.VARIANT_UPDATE: {
          const variantId = details.variant_id as string | undefined
          if (!variantId) {
            passthrough.push(action)
            break
          }
          variantRemoves.delete(variantId)
          const earlier = variantUpdates.get(variantId)
          const fields = (details.fields ?? {}) as Record<string, unknown>
          const previous = (details.previous_fields ?? {}) as Record<
            string,
            unknown
          >
          if (!earlier) {
            variantUpdates.set(variantId, action)
            break
          }
          const earlierDetails = (earlier.details ?? {}) as Record<
            string,
            unknown
          >
          const earlierFields = (earlierDetails.fields ?? {}) as Record<
            string,
            unknown
          >
          const earlierPrevious = (earlierDetails.previous_fields ??
            {}) as Record<string, unknown>
          const mergedFields: Record<string, unknown> = {
            ...earlierFields,
            ...fields,
          }
          if (earlierFields.images || fields.images) {
            mergedFields.images = netImages(
              earlierFields.images as ImageDelta | undefined,
              (fields.images ?? {}) as ImageDelta,
            )
          }
          variantUpdates.set(variantId, {
            ...action,
            details: {
              ...details,
              fields: mergedFields,
              previous_fields: { ...previous, ...earlierPrevious },
            },
          })
          break
        }
        case ProductChangeActionType.VARIANT_REMOVE: {
          const variantId = details.variant_id as string | undefined
          if (!variantId) {
            passthrough.push(action)
            break
          }
          variantUpdates.delete(variantId)
          variantRemoves.set(variantId, action)
          break
        }
        case ProductChangeActionType.ATTRIBUTE_ADD: {
          const attribute = details.attribute as { id?: string } | undefined
          if (!attribute?.id) {
            inlineAttributeAdds.push(action)
            break
          }
          const state = batchAttributes.get(attribute.id) ?? {
            remove: null,
            add: null,
            update: null,
          }
          state.add = action
          batchAttributes.set(attribute.id, state)
          break
        }
        case ProductChangeActionType.ATTRIBUTE_REMOVE: {
          const attributeId = details.attribute_id as string | undefined
          if (!attributeId) {
            passthrough.push(action)
            break
          }
          const state = batchAttributes.get(attributeId) ?? {
            remove: null,
            add: null,
            update: null,
          }
          state.remove = action
          batchAttributes.set(attributeId, state)
          break
        }
        case ProductChangeActionType.ATTRIBUTE_UPDATE: {
          const update = details.update as ProductAttributeBatchUpdate | undefined
          if (!update?.id) {
            passthrough.push(action)
            break
          }
          const state = batchAttributes.get(update.id) ?? {
            remove: null,
            add: null,
            update: null,
          }
          state.update = state.update
            ? {
                ...action,
                details: {
                  ...details,
                  update: mergeAttributeUpdate(
                    (state.update.details ?? {}).update as ProductAttributeBatchUpdate,
                    update,
                  ),
                },
              }
            : action
          batchAttributes.set(update.id, state)
          break
        }
        default:
          passthrough.push(action)
      }
    }

    for (const [attributeId, next] of batchAttributes) {
      const current = attributes.get(attributeId)
      if (next.add || next.remove || !current) {
        attributes.set(attributeId, next)
        continue
      }
      if (current.remove && !current.add) {
        attributes.set(attributeId, { remove: null, add: null, update: next.update })
        continue
      }
      const earlierUpdate = current.update
      const laterUpdate = next.update as T
      current.update = earlierUpdate
        ? ({
            ...laterUpdate,
            details: {
              ...(laterUpdate.details ?? {}),
              update: mergeAttributeUpdate(
                (earlierUpdate.details ?? {}).update as ProductAttributeBatchUpdate,
                (laterUpdate.details ?? {}).update as ProductAttributeBatchUpdate,
              ),
            },
          } as T)
        : laterUpdate
    }
  }

  const collapsed: T[] = [...passthrough]

  if (statusChange.action) {
    const action = statusChange.action
    collapsed.push(
      statusChange.previous === undefined
        ? action
        : {
            ...action,
            details: {
              ...(action.details ?? {}),
              previous_status: statusChange.previous,
            },
          },
    )
  }

  collapsed.push(...productFields.values())
  collapsed.push(...variantUpdates.values())
  collapsed.push(...variantRemoves.values())

  for (const state of attributes.values()) {
    if (state.remove) collapsed.push(state.remove as T)
    if (state.add) collapsed.push(state.add as T)
    if (state.update) collapsed.push(state.update as T)
  }
  collapsed.push(...inlineAttributeAdds)

  return collapsed.sort(byOrdering)
}

/**
 * The request as an operator or the store should read it: one entry per field,
 * variant and attribute, with the latest value.
 */
export const withCollapsedActions = <
  C extends { actions?: CollapsibleProductChangeAction[] | null },
>(
  change: C,
): C => ({
  ...change,
  actions: change.actions
    ? collapseProductChangeActions(change.actions)
    : change.actions,
})
