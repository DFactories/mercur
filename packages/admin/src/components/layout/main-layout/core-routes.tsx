import {
  BuildingStorefront,
  Buildings,
  CreditCardRefresh,
  CurrencyDollar,
  ReceiptPercent,
  ShoppingCart,
  Tag,
  Users,
} from "@medusajs/icons";
import { useTranslation } from "react-i18next";

import { INavItem } from "../nav-item";

/**
 * The main sidebar's entries, in the order they are shown.
 *
 * Its own module because two things need the same ordered list: the sidebar
 * renders it, and `pages/home` picks the first entry the operator may open as
 * their landing screen. A second copy of the order would drift, and the way it
 * would show up is somebody landing on a page that is not in their sidebar.
 */
export const useCoreRoutes = (): Omit<INavItem, "pathname">[] => {
  const { t } = useTranslation();

  return [
    {
      icon: <ShoppingCart />,
      label: t("orders.domain"),
      to: "/orders",
      items: [
        // TODO: Enable when domin is introduced
        // {
        //   label: t("draftOrders.domain"),
        //   to: "/draft-orders",
        // },
      ],
    },
    {
      icon: <Tag />,
      label: t("products.domain"),
      to: "/products",
      items: [
        {
          label: t("offers.domain"),
          to: "/offers",
        },
        {
          label: t("collections.domain"),
          to: "/collections",
        },
        {
          label: t("categories.domain"),
          to: "/categories",
        },
        // TODO: Enable when domin is introduced
        // {
        //   label: t("giftCards.domain"),
        //   to: "/gift-cards",
        // },
      ],
    },
    {
      icon: <Buildings />,
      label: t("inventory.domain"),
      to: "/inventory",
      items: [
        {
          label: t("reservations.domain"),
          to: "/reservations",
        },
      ],
    },
    {
      icon: <Users />,
      label: t("customers.domain"),
      to: "/customers",
      items: [
        {
          label: t("customerGroups.domain"),
          to: "/customer-groups",
        },
      ],
    },
    {
      icon: <ReceiptPercent />,
      label: t("promotions.domain"),
      to: "/promotions",
      items: [
        {
          label: t("campaigns.domain"),
          to: "/campaigns",
        },
      ],
    },
    {
      icon: <CurrencyDollar />,
      label: t("priceLists.domain"),
      to: "/price-lists",
    },
    {
      icon: <BuildingStorefront />,
      label: t("stores.domain"),
      to: "/stores",
      items: [
        {
          label: t("reviews.domain"),
          to: "/reviews",
        },
      ],
    },
    {
      icon: <CreditCardRefresh />,
      label: t("payouts.domain"),
      to: "/payouts",
    },
  ];
};
