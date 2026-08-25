/**
 * A route loader prefetches the first, UNFILTERED page and the table hands it to
 * react-query as `initialData`. That seed is keyed by query key, so giving it to
 * a filtered/sorted/paged key tells react-query the data is already fresh — and
 * the client's 90s `staleTime` then suppresses the fetch entirely. The result is
 * a filter chip above an unchanged list.
 *
 * `useQueryParams` yields `undefined` for absent keys, so "the loader's request
 * is still this request" is exactly "no key has a defined value". `?q=` is a
 * search for the empty string and counts as state.
 */
export const isLoaderQueryPristine = (
  raw: Record<string, string | undefined>
): boolean => Object.values(raw ?? {}).every((value) => value === undefined)

export const loaderInitialData = <T>(
  raw: Record<string, string | undefined>,
  loaderData: T | undefined
): T | undefined => (isLoaderQueryPristine(raw) ? loaderData : undefined)
