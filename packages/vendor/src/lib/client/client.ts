import { createClient, InferClient } from '@mercurjs/client'
import { Routes } from '@mercurjs/core/_generated'
import config from 'virtual:mercur/config'

import { assetUrl } from '../../utils/asset-url'
import { localizeApiMessage } from '../../i18n/api-error-translator'
import { postMultipart } from './multipart'

export const backendUrl = config.backendUrl ?? 'http://localhost:9000'

export const sdk: InferClient<Routes> = createClient({
  baseUrl: backendUrl,
  fetchOptions: {
    credentials: 'include',
  },
})

export const fetchQuery = async (
  url: string,
  {
    method,
    body,
    query,
    headers,
  }: {
    method: 'GET' | 'POST' | 'DELETE'
    body?: object
    query?: Record<string, string | number | object>
    headers?: { [key: string]: string }
  }
) => {
  const params = Object.entries(query || {}).reduce((acc, [key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      if (Array.isArray(value)) {
        const arrayParams = value
          .map(
            (item) =>
              `${encodeURIComponent(key)}[]=${encodeURIComponent(item)}`
          )
          .join('&')
        if (acc) {
          acc += '&' + arrayParams
        } else {
          acc = arrayParams
        }
      } else {
        const separator = acc ? '&' : ''
        const serializedValue =
          typeof value === 'object' ? JSON.stringify(value) : value
        acc += `${separator}${encodeURIComponent(key)}=${encodeURIComponent(serializedValue)}`
      }
    }
    return acc
  }, '')

  const response = await fetch(
    `${backendUrl}${url}${params ? `?${params}` : ''}`,
    {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : null,
    }
  )

  if (!response.ok) {
    const errorData = await response.json()

    if (response.status === 401) {
      window.location.href = `${assetUrl('/login')}?reason=Unauthorized`
      return
    }

    // Same language boundary the typed SDK goes through — this helper predates
    // it and was the one path still surfacing raw English to the panel.
    const error = new Error(
      localizeApiMessage(errorData.message, response.status)
    )
      ; (error as Error & { status: number }).status = response.status
    throw error
  }

  return response.json()
}

const redirectToLogin = () => {
  window.location.href = `${assetUrl('/login')}?reason=Unauthorized`
}

// DFACTORIES: multipart upload helper for vendor media (member photo). Kept
// separate from the typed sdk because it posts FormData. Stores PUBLICLY —
// never use it for a document; see `uploadStoreDocumentsQuery`.
export const uploadFilesQuery = async (files: any[]) => {
  const formData = new FormData()

  for (const { file } of files) {
    formData.append('files', file)
  }

  return postMultipart<{ files: { id: string; url: string }[] }>(
    `${backendUrl}/vendor/uploads`,
    formData,
    redirectToLogin
  )
}

// DFACTORIES: the store's business license / health permit, into the host's
// PRIVATE bucket. One part per document, named after it: `business_license`,
// `health_permit`. Answers with the documents as they now stand.
export const uploadStoreDocumentsQuery = async (formData: FormData) =>
  postMultipart<StoreDocumentsResponse>(
    `${backendUrl}/vendor/store-documents`,
    formData,
    redirectToLogin
  )

export type StoreDocumentType = 'business_license' | 'health_permit'

export type StoreDocument = {
  /** Short-lived presigned URL — never store it. */
  url: string
  mime_type: string | null
  /** Seconds `url` stays valid; null for a not-yet-migrated public URL. */
  expires_in: number | null
  legacy: boolean
}

export type StoreDocumentsResponse = {
  store_documents: Record<StoreDocumentType, StoreDocument | null>
}
