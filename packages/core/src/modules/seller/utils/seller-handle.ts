/**
 * What a seller update may do to the store's handle: nothing, unless it names
 * a new one.
 *
 * The handle is the store's public address — `/sellers/<handle>`, storefront
 * links, anything bookmarked or indexed. Deriving it from the name is how a
 * NEW store gets one; on an update the same rule meant any payload carrying
 * `name` without `handle` silently rewrote the address, even when the name
 * itself had not changed (`custom-handle` became `handle-probe` on an edit
 * that resent the same name). So an update never derives a handle, and a
 * blank one (`""`, `null`) is dropped rather than written: the column is the
 * URL and cannot be cleared.
 */
export const withoutImplicitHandleChange = <
  T extends { handle?: string | null },
>(
  seller: T,
): T => {
  if (!("handle" in seller) || seller.handle) {
    return seller
  }

  const { handle: _blank, ...rest } = seller
  return rest as T
}
