import { createClient, InferClient } from '@mercurjs/client'
import { Routes } from '@mercurjs/core/_generated'
import config from 'virtual:mercur/config'

import { assetUrl } from '../../utils/asset-url'

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

    const error = new Error(errorData.message || 'Server error')
      ; (error as Error & { status: number }).status = response.status
    throw error
  }

  return response.json()
}

// DFACTORIES: a store's business license / health permit, into the host's
// PRIVATE bucket (`/admin/sellers/:id/store-documents`). One part per document,
// named after it. Kept separate from the typed sdk because it posts FormData;
// throws the backend's refusal like `fetchQuery` does.
export const uploadSellerStoreDocumentsQuery = async (
  sellerId: string,
  formData: FormData
): Promise<StoreDocumentsResponse | undefined> => {
  const response = await fetch(
    `${backendUrl}/admin/sellers/${sellerId}/store-documents`,
    { method: 'POST', credentials: 'include', body: formData }
  )

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      message?: string
    }

    if (response.status === 401) {
      window.location.href = `${assetUrl('/login')}?reason=Unauthorized`
      return undefined
    }

    const error = new Error(errorData.message || 'Server error')
      ; (error as Error & { status: number }).status = response.status
    throw error
  }

  return response.json()
}

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
