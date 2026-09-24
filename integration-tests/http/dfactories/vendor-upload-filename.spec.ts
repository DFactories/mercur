import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { IFileModuleService, MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { createSellerUser } from "../../helpers/create-seller-user"

/**
 * Production, 2026-09-23: a producer uploaded a phone photo named with Persian
 * digits (`۲۰۲۶۰۷۰۶_۱۹۳۴۵۲`) and it was stored as
 * `…/dfactories/%C3%9B%C2%B2%C3%9B%C2%B0…-01M36X5NF25C4RHA21NZEGX95Y.heic`.
 *
 * `%C3%9B%C2%B2` is `Û²` — the UTF-8 bytes of `۲` (DB B2) read one byte per
 * character. multer hands busboy `defParamCharset: "latin1"` unless told
 * otherwise, while every browser sends the filename as UTF-8, so every
 * non-ASCII name came out mangled and the mangled string became the object key.
 *
 * The body here is built the way a browser builds it: the filename's raw UTF-8
 * bytes inside `filename="…"`, no RFC 5987 `filename*` alternative.
 */

jest.setTimeout(180000)

const PERSIAN_NAME = "۲۰۲۶۰۷۰۶_۱۹۳۴۵۲.png"
// Smallest valid PNG: 1×1, one transparent pixel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
)
const BOUNDARY = "----dfactories-upload-filename"

const multipartBody = (filename: string, content: Buffer) =>
  Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        'Content-Disposition: form-data; name="files"; filename="'
    ),
    Buffer.from(filename, "utf8"),
    Buffer.from('"\r\nContent-Type: image/png\r\n\r\n'),
    content,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
  ])

medusaIntegrationTestRunner({
  testSuite: ({ getContainer, api }) => {
    describe("Vendor - upload filenames", () => {
      let appContainer: MedusaContainer
      let sellerHeaders: { headers: Record<string, string> }
      const uploaded: string[] = []

      beforeAll(() => {
        appContainer = getContainer()
      })

      beforeEach(async () => {
        const { headers } = await createSellerUser(appContainer, {
          email: "upload-filename-seller@test.com",
          name: "Upload Filename Seller",
        })
        sellerHeaders = headers
      })

      afterAll(async () => {
        if (uploaded.length) {
          await appContainer
            .resolve<IFileModuleService>(Modules.FILE)
            .deleteFiles(uploaded)
        }
      })

      it("stores a Persian filename as the producer named it", async () => {
        const response = await api.post(
          "/vendor/uploads",
          multipartBody(PERSIAN_NAME, PNG),
          {
            headers: {
              ...sellerHeaders.headers,
              "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
            },
          }
        )

        expect(response.status).toEqual(200)
        const [file] = response.data.files
        uploaded.push(file.id)

        expect(decodeURIComponent(file.url)).toContain(PERSIAN_NAME)
        // The production symptom: `Û` percent-encoded.
        expect(file.url).not.toContain("%C3%9B")
      })
    })
  },
})
