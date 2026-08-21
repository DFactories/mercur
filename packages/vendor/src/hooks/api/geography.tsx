import { useQuery } from "@tanstack/react-query";

import { backendUrl } from "../../lib/client";

// DFACTORIES: Iran provinces/cities lookups for the onboarding selects.
// `/geography/*` is a PUBLIC backend namespace (no auth, no publishable key)
// because the onboarding wizard runs before any session exists — so these are
// fetched without credentials.

export type GeoProvince = {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  slug: string;
  display_order: number;
};

export type GeoCity = {
  id: string;
  province_id: string;
  name: string;
  name_en: string | null;
  slug: string;
  is_capital: boolean;
};

const getJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(`${backendUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json() as Promise<T>;
};

export const useGeoProvinces = () =>
  useQuery({
    queryKey: ["geography", "provinces"],
    queryFn: () =>
      getJson<{ provinces: GeoProvince[] }>("/geography/provinces?limit=100"),
    staleTime: 5 * 60 * 1000,
  });

export const useGeoCities = (provinceId?: string) =>
  useQuery({
    queryKey: ["geography", "cities", provinceId],
    queryFn: () =>
      getJson<{ cities: GeoCity[] }>(
        `/geography/cities?province_id=${encodeURIComponent(provinceId ?? "")}&limit=1000`,
      ),
    enabled: !!provinceId,
    staleTime: 5 * 60 * 1000,
  });
