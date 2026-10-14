/**
 * Rows per `POST /vendor/offers/batch`.
 *
 * On 2026-10-14 a producer priced more than 100 variants and the form sent them
 * all at once; the backend's cap of 100 refused the lot, three times. Core `.38`
 * raised the cap to 500, but a catalogue can outgrow any cap, so the form sends
 * fixed-size parts instead. 100 stays within every backend version's limit and
 * well under the request body limit (~0.5 KB a row).
 */
export const OFFER_CREATE_CHUNK_SIZE = 100

export const chunk = <T>(items: T[], size: number): T[][] => {
  if (size < 1) {
    throw new Error(`chunk size must be at least 1, got ${size}`)
  }
  const parts: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    parts.push(items.slice(i, i + size))
  }
  return parts
}

export type ChunkedSubmitResult<T> = {
  /** Items whose part the backend accepted, in order. */
  sent: T[]
  /** The part that failed, or null when every part went through. */
  failed: T[] | null
  /** What the failing part threw. */
  error?: unknown
}

/**
 * Send `items` part by part, one request at a time, and stop at the first part
 * that fails. Each part is all-or-nothing on the backend (one workflow), so
 * `sent` is exactly what now exists: the caller must not send it again.
 */
export const submitInChunks = async <T>(
  items: T[],
  send: (part: T[]) => Promise<unknown>,
  size: number = OFFER_CREATE_CHUNK_SIZE
): Promise<ChunkedSubmitResult<T>> => {
  const sent: T[] = []
  for (const part of chunk(items, size)) {
    try {
      await send(part)
    } catch (error) {
      return { sent, failed: part, error }
    }
    sent.push(...part)
  }
  return { sent, failed: null }
}
