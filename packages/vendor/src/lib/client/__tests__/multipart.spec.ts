import { init } from "i18next"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import en from "../../../i18n/translations/en.json"
import fa from "../../../i18n/translations/fa.json"
import { postMultipart } from "../multipart"

beforeAll(async () => {
  await init({
    lng: "fa",
    fallbackLng: "en",
    resources: { fa: { translation: fa }, en: { translation: en } },
    interpolation: { escapeValue: false },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  )

describe("postMultipart", () => {
  it("returns the JSON answer", async () => {
    respond(200, { files: [{ id: "f1", url: "https://x/f1.webp" }] })

    await expect(
      postMultipart("https://api/vendor/uploads", new FormData(), vi.fn())
    ).resolves.toEqual({ files: [{ id: "f1", url: "https://x/f1.webp" }] })
  })

  it("throws the backend's refusal in the panel's language, with its status", async () => {
    // The helper this replaces returned null here, and the profile form then
    // read `.files` off it: the producer saw "Cannot read properties of null".
    respond(400, { message: 'File "business_license" is too large (max 10 MB)' })

    const error = await postMultipart(
      "https://api/vendor/store-documents",
      new FormData(),
      vi.fn()
    ).catch((e: Error & { status?: number }) => e)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(
      "حجم فایل بیش از حد مجاز است (حداکثر 10 مگابایت)."
    )
    expect((error as Error & { status?: number }).status).toBe(400)
  })

  it("still says something when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>502</html>", { status: 502 }))
    )

    await expect(
      postMultipart("https://api/vendor/uploads", new FormData(), vi.fn())
    ).rejects.toThrow(fa.apiErrors.serviceUnavailable)
  })

  it("hands a 401 to the caller instead of throwing", async () => {
    respond(401, { message: "Unauthorized" })
    const onUnauthorized = vi.fn()

    await expect(
      postMultipart("https://api/vendor/uploads", new FormData(), onUnauthorized)
    ).resolves.toBeUndefined()
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
