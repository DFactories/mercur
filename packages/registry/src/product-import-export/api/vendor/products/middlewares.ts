import { MiddlewareRoute } from "@medusajs/medusa"
import multer from "multer"

// UTF-8, not multer's latin1 default: browsers send non-ASCII filenames as
// UTF-8 bytes (see core's `vendor/uploads` middleware).
const upload = multer({
  storage: multer.memoryStorage(),
  defParamCharset: "utf8",
})

export const productImportExportMiddlewares: MiddlewareRoute[] = [
  {
    method: ["POST"],
    matcher: "/vendor/products/import",
    middlewares: [upload.single("file")],
  },
]
