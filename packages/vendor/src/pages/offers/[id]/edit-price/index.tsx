import { HttpTypes } from "@medusajs/types"
import { OfferDTO } from "@mercurjs/types"
import { Button, toast } from "@medusajs/ui"
import { useMemo } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { Thumbnail } from "../../../../components/common/thumbnail"
import {
  createDataGridHelper,
  createDataGridPriceColumns,
  DataGrid,
} from "../../../../components/data-grid"
import { RouteFocusModal, useRouteModal } from "../../../../components/modals"
import { KeyboundForm } from "../../../../components/utilities/keybound-form"
import { usePricePreferences } from "../../../../hooks/api/price-preferences"
import { useProduct, productsQueryKeys } from "../../../../hooks/api/products"
import { offerQueryKeys } from "../../../../hooks/api/offers"
import { useCurrentSeller } from "../../../../hooks/api/sellers"
import { sdk } from "../../../../lib/client"
import { queryClient } from "../../../../lib/query-client"
import { OFFER_PRODUCT_DETAIL_FIELDS } from "../../common/constants"
import { translateApiError } from "../../../../i18n/api-error-translator"

type EditPriceRow = {
  offer_id: string
  variant_title: string
  product_thumbnail?: string | null
  prices: Record<string, number | "">
}

type FormValues = { rows: EditPriceRow[] }

type PriceProduct = HttpTypes.AdminProduct & {
  variants?: Array<
    HttpTypes.AdminProductVariant & { offers?: OfferDTO[] | null }
  > | null
}

/**
 * A blank cell is "no price", not "free". Coercing it to `0` is how unpriced
 * offers reached the storefront and printed «۰ تومان» on every card; the
 * backend now rejects a non-positive amount outright, which turned the same
 * mistake into a half-saved grid — see `collectPriceRows`.
 */
const parsePrice = (v: number | "" | undefined | null): number | null => {
  if (v === "" || v === null || v === undefined) {
    return null
  }
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : null
}

/** Only cells the producer actually filled in become price rows. */
const collectPriceRows = (
  row: EditPriceRow,
  currencies: string[],
): { amount: number; currency_code: string }[] => {
  const prices: { amount: number; currency_code: string }[] = []
  for (const code of currencies) {
    const amount = parsePrice(row.prices?.[code])
    if (amount === null) {
      continue
    }
    prices.push({ amount, currency_code: code })
  }
  return prices
}

const buildRows = (product: PriceProduct, currencies: string[]): EditPriceRow[] =>
  (product.variants ?? []).flatMap((variant) =>
    (variant.offers ?? []).map((offer) => {
      const prices: Record<string, number | ""> = {}
      for (const code of currencies) {
        const match = (offer.prices ?? []).find(
          (p) => p.currency_code === code,
        )
        prices[code] = match?.amount ?? ""
      }
      return {
        offer_id: offer.id,
        variant_title: variant.title ?? "",
        product_thumbnail: product.thumbnail ?? null,
        prices,
      }
    }),
  )

const columnHelper = createDataGridHelper<EditPriceRow, FormValues>()

const useColumns = ({
  currencies,
  pricePreferences,
}: {
  currencies: string[]
  pricePreferences?: HttpTypes.AdminPricePreference[]
}) => {
  const { t } = useTranslation()

  return useMemo(
    () => [
      columnHelper.column({
        id: "title",
        header: t("fields.title"),
        cell: (context) => {
          const entity = context.row.original
          return (
            <DataGrid.ReadonlyCell context={context}>
              <div className="flex h-full w-full items-center gap-x-2 overflow-hidden">
                <Thumbnail src={entity.product_thumbnail ?? null} />
                <span className="truncate" title={entity.variant_title}>
                  {entity.variant_title}
                </span>
              </div>
            </DataGrid.ReadonlyCell>
          )
        },
        disableHiding: true,
      }),
      ...createDataGridPriceColumns<EditPriceRow, FormValues>({
        currencies,
        pricePreferences: pricePreferences ?? [],
        getFieldName: (context, value) => {
          if (context.column.id?.startsWith("currency_prices")) {
            return `rows.${context.row.index}.prices.${value}`
          }
          return null
        },
        t,
      }),
    ],
    [t, currencies, pricePreferences],
  )
}

const EditPriceGrid = ({
  product,
  productId,
}: {
  product: PriceProduct
  productId: string
}) => {
  const { t } = useTranslation()
  const { handleSuccess, setCloseOnEscape } = useRouteModal()
  const { currency_code } = useCurrentSeller()
  const { price_preferences: pricePreferences } = usePricePreferences({})

  const currencies = useMemo(
    () => (currency_code ? [currency_code] : []),
    [currency_code],
  )

  const rows = useMemo(
    () => buildRows(product, currencies),
    [product, currencies],
  )

  const form = useForm<FormValues>({ defaultValues: { rows } })
  const columns = useColumns({ currencies, pricePreferences })

  const handleSubmit = form.handleSubmit(async (values) => {
    // Validate the WHOLE grid before a single request goes out. Each row is its
    // own request (there is no batch offer-update route), so a row the backend
    // was always going to reject used to be discovered only after its siblings
    // had already been written — the vendor saw an error and a changed price at
    // the same time, with no way to tell which rows had landed.
    //
    // Only cells the producer TOUCHED are judged. A cell they cleared is a
    // mistake worth stopping on (an offer with no price cannot be sold, and the
    // blank used to be sent as `0`); a row that arrived empty and was left alone
    // is simply not part of this edit.
    const dirtyRows = form.formState.dirtyFields.rows ?? []
    const isDirty = (index: number, code: string) =>
      Boolean(dirtyRows[index]?.prices?.[code])

    let invalid = false
    values.rows.forEach((row, index) => {
      for (const code of currencies) {
        if (!isDirty(index, code)) {
          continue
        }
        const amount = parsePrice(row.prices?.[code])
        if (amount === null || amount <= 0) {
          form.setError(`rows.${index}.prices.${code}`, {
            type: "manual",
            message: t("offers.validation.priceRequired"),
          })
          invalid = true
        }
      }
    })
    if (invalid) {
      return
    }

    const saved: string[] = []
    try {
      for (const [index, row] of values.rows.entries()) {
        // Untouched rows are not re-sent: re-posting an unchanged ladder is a
        // write that can fail, and a failed write on a row nobody edited is the
        // partial-save this whole path exists to avoid.
        if (!currencies.some((code) => isDirty(index, code))) {
          continue
        }
        const prices = collectPriceRows(row, currencies)
        if (!prices.length) {
          continue
        }
        await sdk.vendor.offers.$id.mutate({ $id: row.offer_id, prices })
        saved.push(row.variant_title)
      }
      toast.success(t("offers.pricing.successToast"))
      handleSuccess()
    } catch (error) {
      // Say exactly how far it got. Silence here is what made the half-write
      // indistinguishable from a no-op.
      toast.error(
        saved.length
          ? t("offers.pricing.partialErrorToast", {
              message: translateApiError(error),
              saved: saved.join("، "),
            })
          : translateApiError(error),
      )
    } finally {
      await queryClient.invalidateQueries({ queryKey: offerQueryKeys.lists() })
      await queryClient.invalidateQueries({
        queryKey: productsQueryKeys.detail(productId),
      })
    }
  })

  return (
    <RouteFocusModal.Form form={form}>
      <KeyboundForm
        onSubmit={handleSubmit}
        className="flex h-full flex-col overflow-hidden"
        data-testid="offer-edit-price-form"
      >
        <RouteFocusModal.Header />
        <RouteFocusModal.Body className="flex-1 overflow-hidden p-0">
          <DataGrid
            columns={columns}
            data={rows}
            state={form}
            onEditingChange={(editing) => setCloseOnEscape(!editing)}
          />
        </RouteFocusModal.Body>
        <RouteFocusModal.Footer>
          <div className="flex items-center justify-end gap-x-2">
            <RouteFocusModal.Close asChild>
              <Button size="small" variant="secondary">
                {t("actions.cancel")}
              </Button>
            </RouteFocusModal.Close>
            <Button
              size="small"
              type="submit"
              isLoading={form.formState.isSubmitting}
            >
              {t("actions.save")}
            </Button>
          </div>
        </RouteFocusModal.Footer>
      </KeyboundForm>
    </RouteFocusModal.Form>
  )
}

export const OfferEditPricePage = () => {
  const { id } = useParams()
  const { t } = useTranslation()
  const { product, isPending, isError, error } = useProduct(id!, {
    fields: OFFER_PRODUCT_DETAIL_FIELDS,
  })

  if (isError) throw error

  return (
    <RouteFocusModal>
      <RouteFocusModal.Title asChild>
        <span className="sr-only">{t("offers.pricing.header")}</span>
      </RouteFocusModal.Title>
      <RouteFocusModal.Description asChild>
        <span className="sr-only">{t("offers.pricing.description")}</span>
      </RouteFocusModal.Description>
      {!isPending && product && (
        <EditPriceGrid product={product as PriceProduct} productId={id!} />
      )}
    </RouteFocusModal>
  )
}

export const Component = OfferEditPricePage
