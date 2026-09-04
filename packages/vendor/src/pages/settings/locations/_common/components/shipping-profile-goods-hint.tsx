import { Alert, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useShippingProfile } from "@hooks/api/shipping-profiles"

type ShippingProfileGoodsHintProps = {
  shippingProfileId?: string | null
}

/**
 * Says, before the option is saved, how many of this seller's goods sit on the
 * chosen shipping profile — and what happens when the answer is none.
 *
 * The same rule is enforced on the buyer's side, where it can only surface as a
 * checkout error for someone who cannot fix it. Here it reaches the person who
 * can, while the fix is still one field away.
 */
export const ShippingProfileGoodsHint = ({
  shippingProfileId,
}: ShippingProfileGoodsHintProps) => {
  const { t } = useTranslation()

  const { shipping_profile, isPending } = useShippingProfile(
    shippingProfileId ?? "",
    undefined,
    { enabled: Boolean(shippingProfileId) }
  )

  const count = shipping_profile?.seller_product_count

  if (!shippingProfileId || isPending || count === undefined || count > 0) {
    return null
  }

  return (
    <Alert
      variant="warning"
      className="bg-ui-bg-base"
      data-testid="shipping-profile-goods-hint"
    >
      <div className="flex flex-col">
        <Text size="small" leading="compact" weight="plus" asChild>
          <span>
            {t("stockLocations.shippingOptions.fields.profileGoods.header")}
          </span>
        </Text>
        <Text size="small" leading="compact" className="text-pretty">
          {t("stockLocations.shippingOptions.fields.profileGoods.description", {
            productCount: count,
          })}
        </Text>
      </div>
    </Alert>
  )
}
