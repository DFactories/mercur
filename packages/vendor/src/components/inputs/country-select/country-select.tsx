import {
  ComponentPropsWithoutRef,
  ComponentType,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";
import { countries, selectableCountries } from "../../../lib/data/countries";
import { Select } from "@medusajs/ui";

/**
 * The marketplace operates inside Iran only, so every country field is Iran and
 * is not the producer's to change. Locking here rather than at each call site
 * means a new form inherits it instead of silently reopening the world list.
 * `allowAnyCountry` is the deliberate escape hatch if a surface ever needs one.
 */
const DEFAULT_COUNTRY_ISO2 = "ir";

type CountrySelectProps = ComponentPropsWithoutRef<typeof Select> & {
  placeholder?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  allowAnyCountry?: boolean;
};

const getDisplayNames = (language: string) => {
  try {
    return new Intl.DisplayNames([language], { type: "region" });
  } catch {
    return null;
  }
};

export const CountrySelect: ComponentType<CountrySelectProps> = forwardRef<
  HTMLButtonElement,
  CountrySelectProps
>(
  (
    {
      disabled,
      placeholder,
      defaultValue,
      onChange,
      allowAnyCountry = false,
      ...field
    },
    ref
  ) => {
    const { t, i18n } = useTranslation();
    const innerRef = useRef<HTMLButtonElement>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLButtonElement);

    const localizedCountries = useMemo(() => {
      const displayNames = getDisplayNames(i18n.language);
      const collator = new Intl.Collator(i18n.language, { sensitivity: "base" });

      return (allowAnyCountry ? countries : selectableCountries)
        .map((country) => ({
          ...country,
          localized_name:
            displayNames?.of(country.iso_2.toUpperCase()) ??
            country.display_name,
        }))
        .sort((a, b) => collator.compare(a.localized_name, b.localized_name));
    }, [i18n.language, allowAnyCountry]);

    const currentValue =
      typeof field.value === "string" ? field.value.toLowerCase() : undefined;

    // Keep the submitted value in step with the locked display, otherwise the
    // form would post an empty (or stale non-Iran) country the API then rejects.
    useEffect(() => {
      if (allowAnyCountry || currentValue === DEFAULT_COUNTRY_ISO2) {
        return;
      }

      onChange?.(DEFAULT_COUNTRY_ISO2);
    }, [allowAnyCountry, currentValue, onChange]);

    const resolvedValue = allowAnyCountry
      ? currentValue
      : DEFAULT_COUNTRY_ISO2;

    return (
      <div className="relative">
        <Select
          {...field}
          value={resolvedValue}
          onValueChange={onChange}
          defaultValue={
            allowAnyCountry
              ? defaultValue?.toLowerCase()
              : DEFAULT_COUNTRY_ISO2
          }
          disabled={disabled || !allowAnyCountry}
        >
          <Select.Trigger ref={innerRef} className="w-full">
            <Select.Value placeholder={placeholder || t("fields.selectCountry")} />
          </Select.Trigger>
          <Select.Content>
            {localizedCountries.map((country) => (
              <Select.Item key={country.iso_2} value={country.iso_2.toLowerCase()}>
                {country.localized_name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
    );
  }
);

CountrySelect.displayName = "CountrySelect";
