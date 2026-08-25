import { Select } from "@medusajs/ui"
import { useTranslation } from "react-i18next"

import { useDocumentDirection } from "../../../hooks/use-document-direction"
import {
  useGeoCities,
  useGeoProvinces,
  type GeoCity,
  type GeoProvince,
} from "../../../hooks/api/geography"

/**
 * Province/city pickers backed by the admin-managed geography catalog.
 *
 * The seller's province and city are matched BY NAME against that catalog to
 * build the seller→province/city links every geography report counts from, so a
 * free-text field is not merely inconvenient: a typo, an alternate spelling or
 * «استان تهران» instead of «تهران» leaves the store uncounted everywhere.
 *
 * `country-states.ts`, which the generic `ProvinceSelect` reads, has no IR entry
 * at all — on this marketplace it renders permanently disabled.
 *
 * A stored value the catalog does not contain is offered back as its own option
 * rather than dropped, so a legacy free-text address stays visible and is not
 * silently blanked by opening the form.
 */

const useDisplayName = () => {
  const { i18n } = useTranslation()
  const isFa = i18n.language?.startsWith("fa")
  return (item: { name: string; name_en: string | null }) =>
    isFa ? item.name : (item.name_en ?? item.name)
}

/** Resolves the catalog rows the two selects need for one province name. */
export const useGeoSelection = (provinceName?: string | null) => {
  const { data: provincesData, isPending: provincesPending } = useGeoProvinces()
  const provinces: GeoProvince[] = provincesData?.provinces ?? []

  const selectedProvince = provinces.find((p) => p.name === provinceName)

  const { data: citiesData } = useGeoCities(selectedProvince?.id)
  const cities: GeoCity[] = [...(citiesData?.cities ?? [])].sort(
    (a, b) => Number(b.is_capital) - Number(a.is_capital)
  )

  return { provinces, provincesPending, selectedProvince, cities }
}

type GeoSelectProps = {
  value?: string | null
  onChange: (value: string) => void
  disabled?: boolean
  "data-testid"?: string
}

export const GeoProvinceSelect = ({
  provinces,
  value,
  onChange,
  disabled,
  ...props
}: GeoSelectProps & { provinces: GeoProvince[] }) => {
  const { t } = useTranslation()
  const dir = useDocumentDirection()
  const displayName = useDisplayName()

  const isUnlisted = !!value && !provinces.some((p) => p.name === value)

  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
      dir={dir}
    >
      <Select.Trigger className="w-full" data-testid={props["data-testid"]}>
        <Select.Value placeholder={t("geography.selectProvince")} />
      </Select.Trigger>
      <Select.Content>
        {isUnlisted && (
          <Select.Item value={value as string}>{value}</Select.Item>
        )}
        {provinces.map((province) => (
          <Select.Item key={province.id} value={province.name}>
            {displayName(province)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  )
}

export const GeoCitySelect = ({
  cities,
  value,
  onChange,
  disabled,
  ...props
}: GeoSelectProps & { cities: GeoCity[] }) => {
  const { t } = useTranslation()
  const dir = useDocumentDirection()
  const displayName = useDisplayName()

  const isUnlisted = !!value && !cities.some((c) => c.name === value)

  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
      dir={dir}
    >
      <Select.Trigger className="w-full" data-testid={props["data-testid"]}>
        <Select.Value placeholder={t("geography.selectCity")} />
      </Select.Trigger>
      <Select.Content>
        {isUnlisted && (
          <Select.Item value={value as string}>{value}</Select.Item>
        )}
        {cities.map((city) => (
          <Select.Item key={city.id} value={city.name}>
            {displayName(city)}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  )
}
