import { shippingProfileQueryKeys } from "@hooks/api/shipping-profiles"
import { useComboboxData } from "@hooks/use-combobox-data"
import { fetchQuery } from "@lib/client"
import { getShippingProfileName } from "@lib/shipping-options"

type ProfileRow = {
  id?: string
  name?: string | null
  // Older responses nested the profile under the seller link.
  shipping_profile?: { id?: string; name?: string | null } | null
}

/**
 * The shipping-profile picker shared by the create and edit option forms.
 *
 * The page params are forwarded so `defaultValue` really fetches the stored
 * profile (`id=`) and the list pages instead of repeating its first page. `q`
 * is not forwarded: `shipping_profile` declares no searchable field.
 */
export const useShippingProfileCombobox = (defaultValue?: string) =>
  useComboboxData({
    queryFn: ({
      id,
      limit,
      offset,
    }: {
      id?: string
      q?: string
      limit?: number
      offset?: number
    }) =>
      fetchQuery("/vendor/shipping-profiles", {
        method: "GET",
        query: Object.fromEntries(
          Object.entries({ id, limit, offset }).filter(
            ([, value]) => value !== undefined
          )
        ) as Record<string, string | number>,
      }),
    queryKey: [...shippingProfileQueryKeys.lists(), "combobox"],
    getOptions: (data) =>
      ((data.shipping_profiles ?? []) as ProfileRow[]).map((profile) => ({
        label: getShippingProfileName(
          profile.shipping_profile?.name ?? profile.name ?? ""
        ),
        value: (profile.shipping_profile?.id ?? profile.id) as string,
      })),
    defaultValue,
  })
