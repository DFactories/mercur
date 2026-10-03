import { BuildingStorefront, DocumentText, Trash } from "@medusajs/icons"
import { toast, usePrompt } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { ActionMenu } from "../../../components/common/action-menu"
import {
  useBulkDeleteOffers,
  useDeleteOfferDrafts,
} from "../../../hooks/api/offers"

type OfferProductActions = {
  id: string
  /** Every offer id across this product's variants (all sellers). */
  offerIds: string[]
  /** The store's open offer drafts on this product. */
  draftIds: string[]
  /** The single store when the product is offered by exactly one seller. */
  sellerId: string | null
  /** The store the row's offers belong to, shown in the delete prompt. */
  storeName: string | null
}

/**
 * Row kebab for the product-backed admin Offers list (SPEC-010).
 * Admin is read-only, so there is no Edit; the operator can **Open store**
 * (only when a single store offers the product) and **Delete** the
 * product's offers. Delete removes every offer collected from the row via
 * the existing per-offer DELETE fan-out (`useBulkDeleteOffers`).
 */
export const OfferActions = ({ product }: { product: OfferProductActions }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const { mutateAsync: bulkDelete } = useBulkDeleteOffers()
  const { mutateAsync: deleteDrafts } = useDeleteOfferDrafts()

  const handleDelete = async () => {
    if (!product.offerIds.length) {
      return
    }

    const confirmed = await prompt({
      title: t("general.areYouSure"),
      description: t("offers.bulkDelete.description", {
        count: product.offerIds.length,
        storeName: product.storeName ?? t("offers.fields.store"),
      }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })

    if (!confirmed) {
      return
    }

    const result = await bulkDelete(product.offerIds)

    if (result.failed.length === 0) {
      toast.success(
        t("offers.bulkDelete.successToast", { count: result.succeeded.length }),
      )
    } else {
      toast.warning(
        t("offers.bulkDelete.errorToast", {
          message: `${result.succeeded.length}/${product.offerIds.length} succeeded`,
        }),
      )
    }
  }

  const handleDeleteDrafts = async () => {
    const confirmed = await prompt({
      title: t("general.areYouSure"),
      description: t("offers.draft.deleteDescription", {
        count: product.draftIds.length,
        storeName: product.storeName ?? t("offers.fields.store"),
      }),
      confirmText: t("actions.delete"),
      cancelText: t("actions.cancel"),
      variant: "danger",
    })

    if (!confirmed) {
      return
    }

    const result = await deleteDrafts(product.draftIds)

    if (result.failed.length === 0) {
      toast.success(
        t("offers.draft.deletedToast", { count: result.succeeded.length }),
      )
    } else {
      toast.warning(
        t("offers.draft.deleteErrorToast", {
          message: `${result.succeeded.length}/${product.draftIds.length} succeeded`,
        }),
      )
    }
  }

  const groups = []

  if (product.sellerId) {
    groups.push({
      actions: [
        {
          icon: <BuildingStorefront />,
          label: t("offers.actions.openStore"),
          to: `/stores/${product.sellerId}`,
        },
      ],
    })
  }

  const deleteActions = []

  if (product.offerIds.length) {
    deleteActions.push({
      icon: <Trash />,
      label: t("actions.delete"),
      onClick: handleDelete,
    })
  }

  if (product.draftIds.length) {
    deleteActions.push({
      icon: <DocumentText />,
      label: t("offers.draft.delete"),
      onClick: handleDeleteDrafts,
    })
  }

  if (deleteActions.length) {
    groups.push({ actions: deleteActions })
  }

  return <ActionMenu groups={groups} />
}
