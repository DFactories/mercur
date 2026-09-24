import multer from "multer"

import { MiddlewareRoute } from "@medusajs/framework/http"

// multer tells busboy to read multipart filenames as latin1 unless asked
// otherwise, but browsers send them as UTF-8 bytes. Every non-ASCII name came
// out mangled — a Persian photo name `۲۰۲۶۰۷۰۶_۱۹۳۴۵۲` was stored in the bucket
// as `Û²Û°Û²Û¶…` — and that string becomes part of the file's public URL.
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: "utf8",
})

export const vendorUploadsMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/vendor/uploads",
    middlewares: [upload.array("files")],
  },
]
