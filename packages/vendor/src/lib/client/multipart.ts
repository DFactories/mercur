import { localizeApiMessage } from '../../i18n/api-error-translator'

/**
 * POST a `FormData` body and return the JSON answer, or THROW the backend's
 * refusal in panel language — the same contract as `fetchQuery`.
 *
 * The upload helper this replaces answered any non-2xx with `null`. Its caller
 * then read `uploaded.files` off that null, so a photo the backend refused
 * (corrupt, oversized, not an image) surfaced as the English JavaScript error
 * "Cannot read properties of null (reading 'files')", and the reason the
 * backend actually gave was thrown away.
 *
 * Kept free of `virtual:mercur/config` so it can be tested on its own; the
 * caller supplies the absolute URL and what to do about a 401.
 */
export const postMultipart = async <T = unknown>(
  url: string,
  body: FormData,
  onUnauthorized: () => void
): Promise<T | undefined> => {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    body,
  })

  if (!response.ok) {
    if (response.status === 401) {
      onUnauthorized()
      return undefined
    }

    const errorData = (await response.json().catch(() => ({}))) as {
      message?: string
    }
    const error = new Error(
      localizeApiMessage(errorData?.message, response.status)
    )
      ; (error as Error & { status: number }).status = response.status
    throw error
  }

  return (await response.json()) as T
}
