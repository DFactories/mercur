import { Children, ReactNode } from "react";
import { Badge, Container, StatusBadge, Text } from "@medusajs/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { DisplayExtensionZone, DisplayField } from "@mercurjs/dashboard-shared";

import { InferClientOutput } from "@mercurjs/client";
import { sdk } from "@lib/client";

import { useSellerMembers } from "@hooks/api/sellers";
import { StoreDetailHeader } from "./store-detail-header";
import { currencies } from "@/lib/data/currencies";

type Seller = InferClientOutput<typeof sdk.admin.sellers.$id.query>["seller"];

type StoreGeneralSectionProps = {
  seller: Seller;
  children?: ReactNode;
};

export const StoreGeneralSection = ({
  seller,
  children,
}: StoreGeneralSectionProps) => {
  const { t } = useTranslation();

  // Who actually signs in to this store. `seller.phone` above is the store's
  // public CONTACT number — a different thing, and the one an operator kept
  // reading as "the number they registered with".
  //
  // Read through the seats rather than `seller.members`: that relation returns
  // the members themselves, with no `is_owner` to tell them apart. Same query
  // key and args as the members table below, so react-query serves both from
  // one request.
  const { seller_members: seats } = useSellerMembers(
    seller.id,
    { limit: 100, offset: 0 },
    { placeholderData: keepPreviousData },
  );
  const seatList = (seats ?? []) as Array<{
    is_owner?: boolean | null;
    member?: {
      phone?: string | null;
      first_name?: string | null;
      last_name?: string | null;
    } | null;
  }>;
  const owner =
    seatList.find((seat) => seat.is_owner)?.member ?? seatList[0]?.member;
  const ownerName = [owner?.first_name, owner?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <Container className="divide-y p-0">
      {Children.count(children) > 0 ? (
        children
      ) : (
        <>
          <div className="bg-ui-bg-subtle relative h-32 w-full overflow-hidden rounded-t-lg">
            {seller.banner ? (
              <img
                src={seller.banner}
                alt={seller.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div
                  className="h-full w-full"
                  style={{
                    background: `repeating-linear-gradient(
                      -45deg,
                      transparent,
                      transparent 10px,
                      rgba(255,255,255,0.5) 10px,
                      rgba(255,255,255,0.5) 20px
                    )`,
                  }}
                />
              </div>
            )}
          </div>
          <StoreDetailHeader seller={seller} />
          <DisplayField model="seller" zone="general" id="description" data={seller}>
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("fields.description")}
              </Text>
              <Text size="small" leading="compact">
                {seller.description || "-"}
              </Text>
            </div>
          </DisplayField>
          <DisplayField model="seller" zone="general" id="handle" data={seller}>
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("fields.handle")}
              </Text>
              <Text size="small" leading="compact">
                {seller.handle ? `/${seller.handle}` : "-"}
              </Text>
            </div>
          </DisplayField>
          <DisplayField model="seller" zone="general" id="email" data={seller}>
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("fields.email")}
              </Text>
              <Text size="small" leading="compact">
                {seller.email || "-"}
              </Text>
            </div>
          </DisplayField>
          <DisplayField model="seller" zone="general" id="phone" data={seller}>
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("fields.phone")}
              </Text>
              <div className="flex items-center gap-x-2">
                <Text size="small" leading="compact" dir="ltr">
                  {seller.phone || "-"}
                </Text>
                {seller.phone ? (
                  <StatusBadge color={seller.phone_verified_at ? "green" : "orange"}>
                    {seller.phone_verified_at
                      ? t("stores.phoneVerification.verified")
                      : t("stores.phoneVerification.unverified")}
                  </StatusBadge>
                ) : null}
              </div>
            </div>
          </DisplayField>
          <DisplayField
            model="seller"
            zone="general"
            id="owner_phone"
            data={seller}
          >
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("stores.ownerPhone.label")}
              </Text>
              <div className="flex items-center gap-x-2">
                <Text size="small" leading="compact" dir="ltr">
                  {owner?.phone || "-"}
                </Text>
                {ownerName ? (
                  <Text
                    size="small"
                    leading="compact"
                    className="text-ui-fg-muted truncate"
                  >
                    {ownerName}
                  </Text>
                ) : null}
              </div>
            </div>
          </DisplayField>
          <DisplayField model="seller" zone="general" id="website_url" data={seller}>
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("fields.website")}
              </Text>
              <Text size="small" leading="compact">
                {seller.website_url || "-"}
              </Text>
            </div>
          </DisplayField>
          <DisplayField model="seller" zone="general" id="currency_code" data={seller}>
            <div className="text-ui-fg-subtle grid grid-cols-2 px-6 py-4">
              <Text size="small" leading="compact" weight="plus">
                {t("fields.currency")}
              </Text>
              <div className="flex items-center gap-x-2">
                <Badge size="2xsmall">
                  {seller.currency_code?.toUpperCase()}
                </Badge>
                <Text size="small" leading="compact">
                  {currencies[seller.currency_code?.toUpperCase()]?.name || "-"}
                </Text>
              </div>
            </div>
          </DisplayField>
          <DisplayExtensionZone
            model="seller"
            zone="general"
            data={seller}
            builtInFieldIds={[
              "description",
              "handle",
              "email",
              "phone",
              "owner_phone",
              "website_url",
              "currency_code",
            ]}
          />
        </>
      )}
    </Container>
  );
};
