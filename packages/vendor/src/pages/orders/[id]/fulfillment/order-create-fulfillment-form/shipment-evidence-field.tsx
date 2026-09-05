import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, Button, Text } from "@medusajs/ui"

import { fetchQuery } from "@lib/client"

const ACCEPT = "video/mp4,video/quicktime,video/webm"
const MAX_BYTES = 150 * 1024 * 1024

type UploadTicket = {
  key: string
  upload_url: string
}

type ShipmentEvidenceFieldProps = {
  orderId: string
  onKeyChange: (key: string | null) => void
}

type State = "idle" | "uploading" | "done" | "error"

export function ShipmentEvidenceField({
  orderId,
  onKeyChange,
}: ShipmentEvidenceFieldProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const [state, setState] = useState<State>("idle")
  const [filename, setFilename] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const reset = () => {
    setState("idle")
    setFilename(null)
    setMessage(null)
    onKeyChange(null)
    if (inputRef.current) {
      inputRef.current.value = ""
    }
  }

  const upload = async (file: File) => {
    if (file.size > MAX_BYTES) {
      setState("error")
      setMessage(t("orders.fulfillment.shipmentEvidence.tooLarge"))
      return
    }

    setState("uploading")
    setFilename(file.name)
    setMessage(null)

    try {
      const ticket = (await fetchQuery(
        `/vendor/orders/${orderId}/shipment-evidence/upload-url`,
        {
          method: "POST",
          body: {
            filename: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          },
        }
      )) as UploadTicket

      // The only bare fetch here, and it cannot be anything else: this PUT goes
      // to a presigned object-storage URL, not to the API, so the typed client
      // has no route for it and its credentials would break the signature.
      const put = await fetch(ticket.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      })

      if (!put.ok) {
        throw new Error("upload")
      }

      setState("done")
      onKeyChange(ticket.key)
    } catch {
      setState("error")
      setMessage(t("orders.fulfillment.shipmentEvidence.failed"))
      onKeyChange(null)
    }
  }

  return (
    <div className="flex flex-col gap-y-3">
      <div>
        <Text size="small" weight="plus">
          {t("orders.fulfillment.shipmentEvidence.label")}
        </Text>
        <Text size="small" className="text-ui-fg-subtle">
          {t("orders.fulfillment.shipmentEvidence.hint")}
        </Text>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        aria-label={t("orders.fulfillment.shipmentEvidence.label")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void upload(file)
          }
        }}
      />

      <div className="flex items-center gap-x-2">
        <Button
          size="small"
          variant="secondary"
          type="button"
          isLoading={state === "uploading"}
          disabled={state === "uploading"}
          onClick={() => inputRef.current?.click()}
        >
          {state === "done"
            ? t("orders.fulfillment.shipmentEvidence.replace")
            : t("orders.fulfillment.shipmentEvidence.choose")}
        </Button>

        {filename && (
          <Text size="small" className="text-ui-fg-subtle">
            {filename}
          </Text>
        )}

        {state === "done" && (
          <Button size="small" variant="transparent" type="button" onClick={reset}>
            {t("actions.remove")}
          </Button>
        )}
      </div>

      {state === "error" && message && (
        <Alert variant="error">{message}</Alert>
      )}

      {state === "idle" && (
        <Alert variant="warning">
          {t("orders.fulfillment.shipmentEvidence.missingWarning")}
        </Alert>
      )}
    </div>
  )
}
